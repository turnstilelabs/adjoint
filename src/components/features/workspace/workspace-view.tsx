/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useAppStore } from '@/state/app-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChatMessage from '@/components/chat/chat-message';
import type { Message } from '@/components/chat/interactive-chat';
import { SelectionToolbar } from '@/components/selection-toolbar';
import { useSendWorkspaceThreadMessage } from '@/components/workspace/useSendWorkspaceThreadMessage';
import { cn } from '@/lib/utils';
import { Download, MessageCircle, FileUp, Sparkles, X, Eye, Pencil, Maximize2, Minimize2, ArrowLeft, CheckSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LogoSmall } from '@/components/logo-small';
import { WorkspacePreview } from '@/components/features/workspace/workspace-preview';
import { WorkspaceNextStepsCallout } from '@/components/features/workspace/workspace-next-steps-callout';
import { WorkspaceReviewPanel } from '@/components/features/workspace/workspace-review-panel';
import { ArtifactsPanel } from '@/components/explore/artifacts-panel';
import { useExtractWorkspaceInsights } from '@/components/workspace/useExtractWorkspaceInsights';
import { contextBeforeSelection, stripLatexPreambleAndMacros } from '@/lib/latex-context';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, keymap } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';

type Anchor = { top: number; left: number };

function splitSelectionIntoStatementAndProof(selectionLatex: string): { statement: string; proof: string | null } {
    const s = String(selectionLatex ?? '').trim();
    if (!s) return { statement: '', proof: null };

    // Heuristic 1: explicit proof environment inside selection.
    // If present, split at first \begin{proof}.
    const proofBegin = s.search(/\\begin\{proof\*?\}/);
    if (proofBegin >= 0) {
        const statement = s.slice(0, proofBegin).trim();
        const proof = s.slice(proofBegin).trim();
        return { statement, proof: proof || null };
    }

    // Heuristic 2: split on a line starting with "Proof" (common in drafts).
    const lines = s.split(/\r?\n/);
    const idx = lines.findIndex((l) => /^\s*(Proof\b|\*?Proof\b)[:.]?\s*$/i.test(l.trim()));
    if (idx >= 0) {
        const statement = lines.slice(0, idx).join('\n').trim();
        const proof = lines.slice(idx + 1).join('\n').trim();
        return { statement, proof: proof || null };
    }

    // Otherwise treat everything as a statement.
    return { statement: s, proof: null };
}

function downloadTextFile(filename: string, contents: string) {
    const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function WorkspaceView() {
    const { toast } = useToast();
    const doc = useAppStore((s) => s.workspaceDoc);
    const setDoc = useAppStore((s) => s.setWorkspaceDoc);

    const startProof = useAppStore((s) => s.startProof);
    const goHome = useAppStore((s) => s.goHome);
    const returnFromWorkspace = useAppStore((s) => s.returnFromWorkspace);
    const lastViewBeforeWorkspace = useAppStore((s) => s.lastViewBeforeWorkspace);

    const messages = useAppStore((s) => s.workspaceMessages);
    const setMessages = useAppStore((s) => s.setWorkspaceMessages);

    const workspaceArtifacts = useAppStore((s) => (s as any).workspaceArtifacts);
    const workspaceArtifactEdits = useAppStore((s) => (s as any).workspaceArtifactEdits);
    const setWorkspaceArtifactEdit = useAppStore((s) => (s as any).setWorkspaceArtifactEdit);
    const workspaceInsightsIsExtracting = useAppStore((s) => (s as any).workspaceInsightsIsExtracting);
    const extractInsights = useExtractWorkspaceInsights();

    const isChatOpen = useAppStore((s) => s.isWorkspaceChatOpen);
    const setIsChatOpen = useAppStore((s) => s.setIsWorkspaceChatOpen);

    const rightTab = useAppStore((s) => s.workspaceRightPanelTab);
    const setRightTab = useAppStore((s) => s.setWorkspaceRightPanelTab);

    const rightWidth = useAppStore((s) => s.workspaceRightPanelWidth);
    const setRightWidth = useAppStore((s) => s.setWorkspaceRightPanelWidth);

    const draft = useAppStore((s) => s.workspaceDraft);
    const draftNonce = useAppStore((s) => s.workspaceDraftNonce);
    const setDraft = useAppStore((s) => s.setWorkspaceDraft);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const cmRef = useRef<ReactCodeMirrorRef | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const chatScrollRef = useRef<HTMLDivElement | null>(null);
    const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

    // "Focus" state for expanding the chat panel into an overlay (match Prove mode UX).
    const [isChatFocused, setIsChatFocused] = useState(false);

    // Review is a full-screen workspace mode (not shown in the right sidebar).
    const isReviewMode = rightTab === 'review';
    const lastNonReviewTabRef = useRef<'chat' | 'insights' | 'preview'>('chat');

    // When entering review mode, ensure the right sidebar is closed.
    useEffect(() => {
        if (!isReviewMode) return;
        setIsChatOpen(false);
        setIsChatFocused(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReviewMode]);

    // Hover hint coming from the “Getting started in Workspace” callout.
    // Kept as local UI state (no global store changes).
    const [hoverHint, setHoverHint] = useState<'import' | 'chat' | 'preview' | 'review' | 'export' | null>(null);

    useEffect(() => {
        const onHover = (evt: any) => {
            const id = (evt?.detail?.id ?? null) as any;
            setHoverHint(id || null);
        };
        try {
            window.addEventListener('adjoint:workspaceSidebarHover', onHover as any);
            return () => window.removeEventListener('adjoint:workspaceSidebarHover', onHover as any);
        } catch {
            return;
        }
    }, []);

    // UX: when a user first arrives in Workspace for the current browser session,
    // keep the right panel closed so they see the editor first.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const key = 'adjoint.workspace.firstEntryClosePanel.v1';
        try {
            const seen = window.sessionStorage.getItem(key) === '1';
            if (!seen) {
                setIsChatOpen(false);
                setIsChatFocused(false);
                window.sessionStorage.setItem(key, '1');
            }
        } catch {
            // Best-effort: if sessionStorage is unavailable, still prefer closed.
            setIsChatOpen(false);
            setIsChatFocused(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Drag/drop state for inserting chat messages into the editor.
    const [isEditorDragOver, setIsEditorDragOver] = useState(false);

    // Escape closes focused chat overlay.
    useEffect(() => {
        if (!isChatFocused) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsChatFocused(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isChatFocused]);

    // Drag-to-resize state (right panel width)
    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartWidthRef = useRef(0);
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const dx = e.clientX - dragStartXRef.current;
            // Dragging handle left decreases width; right increases.
            const next = dragStartWidthRef.current - dx;
            setRightWidth(next);
        };
        const onUp = () => {
            if (!isDraggingRef.current) return;
            isDraggingRef.current = false;
            try {
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            } catch {
                // ignore
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [setRightWidth]);

    // Selection state for floating toolbar.
    const [selection, setSelection] = useState<{
        text: string;
        anchor: Anchor | null;
        start: number;
        end: number;
    }>({ text: '', anchor: null, start: 0, end: 0 });

    const clearSelection = () => setSelection({ text: '', anchor: null, start: 0, end: 0 });

    // "Prove this" modal state
    const [isProveOpen, setIsProveOpen] = useState(false);
    const [proveIncludeContext, setProveIncludeContext] = useState(true);
    const [proveStripMacros, setProveStripMacros] = useState(true);
    const [proveStatement, setProveStatement] = useState('');
    const [proveContextPreview, setProveContextPreview] = useState('');
    const [provePayload, setProvePayload] = useState('');

    // Autosave doc to localStorage (debounced)
    useEffect(() => {
        try {
            const t = window.setTimeout(() => {
                try {
                    localStorage.setItem('adjoint.workspace.doc', doc ?? '');
                } catch {
                    // ignore
                }
            }, 600);
            return () => window.clearTimeout(t);
        } catch {
            return;
        }
    }, [doc]);

    // Autosave messages to localStorage (best-effort)
    useEffect(() => {
        try {
            localStorage.setItem('adjoint.workspace.messages', JSON.stringify(messages ?? []));
        } catch {
            // ignore
        }
    }, [messages]);

    // Hydrate from localStorage once
    useEffect(() => {
        try {
            if ((doc ?? '').trim().length === 0) {
                const savedDoc = localStorage.getItem('adjoint.workspace.doc');
                if (savedDoc && savedDoc.trim().length > 0) setDoc(savedDoc);
            }
            if ((messages ?? []).length === 0) {
                const raw = localStorage.getItem('adjoint.workspace.messages');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        const safe = parsed
                            .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
                            .map((m: any) => ({ role: m.role, content: String(m.content ?? ''), isTyping: false }));
                        if (safe.length) setMessages(safe as any);
                    }
                }
            }
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateSelectionFromCodeMirror = () => {
        const view = cmRef.current?.view;
        if (!view) return;

        const sel = view.state.selection.main;
        const start = sel.from;
        const end = sel.to;

        if (start === end) {
            clearSelection();
            return;
        }

        const text = view.state.sliceDoc(start, end).trim();
        if (!text) {
            clearSelection();
            return;
        }

        const a = view.coordsAtPos(start);
        const b = view.coordsAtPos(end);
        const rect = view.dom.getBoundingClientRect();
        const cx = ((a?.left ?? rect.left) + (b?.right ?? rect.right)) / 2;
        const top = Math.min(a?.top ?? rect.top, b?.top ?? rect.top);
        const anchor = { top, left: cx };

        setSelection({ text, anchor, start, end });
    };

    const onMouseUp = () => {
        // Legacy textarea fallback (should not run once CodeMirror is mounted)
        const ta = textareaRef.current;
        if (ta && !cmRef.current?.view) {
            const start = ta.selectionStart ?? 0;
            const end = ta.selectionEnd ?? 0;
            if (start === end) {
                clearSelection();
                return;
            }
            const text = (ta.value || '').slice(start, end).trim();
            if (!text) {
                clearSelection();
                return;
            }
            const rect = ta.getBoundingClientRect();
            const anchor = { top: rect.top + 8, left: rect.left + rect.width / 2 };
            setSelection({ text, anchor, start, end });
            return;
        }

        updateSelectionFromCodeMirror();
    };

    const selectionContext = useMemo(() => {
        if (!selection.text || selection.start === selection.end) return null;
        const windowChars = 1200;
        const left = Math.max(0, selection.start - windowChars);
        const right = Math.min((doc || '').length, selection.end + windowChars);
        return {
            selectionText: selection.text,
            contextText: (doc || '').slice(left, right),
        };
    }, [selection, doc]);

    const openProveModalFromSelection = () => {
        const selected = (selection.text || '').trim();
        if (!selected) return;

        const body = proveStripMacros ? stripLatexPreambleAndMacros(selected) : selected;
        const ctx = contextBeforeSelection({
            doc: doc || '',
            selectionStart: selection.start,
            maxChars: 6000,
            stripMacros: proveStripMacros,
        });

        setProveStatement(body);
        setProveContextPreview(ctx);

        // Compute initial payload.
        const statement = body.trim();
        const context = ctx.trim();
        const payload = !statement ? '' : !proveIncludeContext || !context ? statement : `${context}${statement}`;
        setProvePayload(payload);
        setIsProveOpen(true);
    };

    const buildProverPayload = () => {
        const statement = (proveStatement || '').trim();
        const ctx = (proveContextPreview || '').trim();

        if (!statement) return '';
        if (!proveIncludeContext || !ctx) return statement;

        // Keep context above the statement.
        // We intentionally do not include \documentclass etc.
        return `${ctx}${statement}`;
    };

    // Keep the inferred payload in sync with toggles.
    useEffect(() => {
        if (!isProveOpen) return;
        setProvePayload(buildProverPayload());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isProveOpen, proveIncludeContext, proveStripMacros, proveStatement, proveContextPreview]);

    const cmExtensions = useMemo<Extension[]>(() => {
        const latex = StreamLanguage.define(stex);
        const fullHeight = EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
            '.cm-content': { minHeight: '100%' },
        });
        return [
            latex,
            EditorView.lineWrapping,
            fullHeight,
            bracketMatching(),
            closeBrackets(),
            keymap.of(closeBracketsKeymap),
            // Keep selection events in sync with the floating toolbar.
            EditorView.updateListener.of((v) => {
                if (v.selectionSet) updateSelectionFromCodeMirror();
            }),
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const scrollToBottom = () => {
        const el = chatScrollRef.current;
        if (!el) return;
        const viewport = el.querySelector('div[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
        if (!viewport) return;
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Prefill chat input when asked (via selection toolbar)
    const [chatInput, setChatInput] = useState('');
    useEffect(() => {
        if (!draftNonce) return;
        const next = String(draft ?? '');
        setChatInput(next);
        try {
            requestAnimationFrame(() => {
                chatInputRef.current?.focus();
                const len = next.length;
                chatInputRef.current?.setSelectionRange(len, len);
            });
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftNonce]);

    const send = useSendWorkspaceThreadMessage();
    const [isSending, startSending] = useTransition();

    const handleSend = () => {
        const trimmed = chatInput.trim();
        if (!trimmed) return;

        const userMsg: Message = { role: 'user', content: trimmed };
        const typing: Message = { role: 'assistant', content: '', isTyping: true };

        const history = [...messages, userMsg].slice(-8).map((m) => ({ role: m.role, content: m.content }));
        const selectionText = selectionContext?.selectionText;
        const contextText = selectionContext?.contextText ?? (doc || '').slice(0, 2000);

        // Send a cleaner LaTeX context to the model (strip preamble/macros), similar to the prover pipeline.
        // This reduces token waste and avoids flooding the model with \newcommand definitions.
        const cleanedSelectionText = selectionText ? stripLatexPreambleAndMacros(selectionText) : undefined;
        const cleanedContextText = stripLatexPreambleAndMacros(contextText);

        setMessages((prev) => [...prev, userMsg, typing]);

        startSending(async () => {
            await send(
                {
                    request: trimmed,
                    selectionText: cleanedSelectionText,
                    contextText: cleanedContextText,
                    history,
                },
                {
                    onDelta: (delta) => {
                        setMessages((prev) =>
                            prev.map((m, idx) =>
                                idx === prev.length - 1
                                    ? ({ ...m, role: 'assistant', isTyping: true, content: String(m.content || '') + delta } as any)
                                    : m,
                            ),
                        );
                    },
                    onDone: () => {
                        setMessages((prev) =>
                            prev.map((m, idx) => (idx === prev.length - 1 ? ({ ...m, isTyping: false } as any) : m)),
                        );

                        // Auto-extract insights after the assistant finishes.
                        try {
                            const latest = useAppStore.getState().workspaceMessages;
                            const lastUser = [...latest].reverse().find((m: any) => m.role === 'user')?.content;
                            const basis = String(lastUser ?? trimmed);
                            void extractInsights({
                                request: basis,
                                history: latest.slice(-10) as any,
                                seed: (doc || '').slice(0, 2000),
                            });
                        } catch {
                            // ignore
                        }
                    },
                    onError: (msg) => {
                        setMessages((prev) =>
                            prev.map((m, idx) =>
                                idx === prev.length - 1
                                    ? ({ ...m, isTyping: false, content: msg || 'Error.' } as any)
                                    : m,
                            ),
                        );
                    },
                },
            );
        });

        setChatInput('');
        setDraft('', { open: true });
        clearSelection();
    };

    const onImport = async (file: File) => {
        const contents = await file.text();
        setDoc(contents);
    };

    const onExport = () => {
        downloadTextFile('document.tex', doc ?? '');
    };

    // Small guard: if the right panel is open but its current tab isn't visible on the left rail
    // (e.g. older state), close it.
    useEffect(() => {
        if (!isChatOpen) return;
        if (rightTab !== 'chat' && rightTab !== 'insights' && rightTab !== 'preview' && rightTab !== 'review') {
            setIsChatOpen(false);
        }
    }, [isChatOpen, rightTab, setIsChatOpen]);

    // Allow deleting a candidate statement from Workspace Insights.
    useEffect(() => {
        const onDelete = (evt: any) => {
            const s = String(evt?.detail?.statement ?? '').trim();
            if (!s) return;
            try {
                useAppStore.getState().deleteWorkspaceCandidateStatement(s);
            } catch {
                // ignore
            }
        };
        window.addEventListener('artifacts:delete-candidate-statement', onDelete as any);
        return () => window.removeEventListener('artifacts:delete-candidate-statement', onDelete as any);
    }, []);

    const ChatPanel = (
        <div className="relative h-full rounded-lg border bg-background overflow-hidden flex flex-col">
            {/* Header bar (keeps controls aligned + avoids overlaying messages) */}
            <div className="h-11 px-3 border-b flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">
                    {rightTab === 'insights'
                        ? 'Insights'
                        : rightTab === 'preview'
                            ? 'Preview'
                            : 'Chat'}
                </div>

                <div className="flex items-center gap-1">
                    {rightTab !== 'preview' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                // Toggle: Insights <-> Chat
                                setRightTab(useAppStore.getState().workspaceRightPanelTab === 'insights' ? 'chat' : 'insights');
                                setIsChatOpen(true);
                            }}
                            aria-label="Insights"
                            title="Insights"
                            className={cn(
                                'h-8 w-8',
                                rightTab === 'insights' ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : '',
                            )}
                        >
                            <Sparkles className="h-4 w-4" />
                        </Button>
                    )}

                    {rightTab === 'chat' && (
                        isChatFocused ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsChatFocused(false)}
                                aria-label="Reduce to panel"
                                title="Reduce"
                                className="h-8 w-8"
                            >
                                <Minimize2 className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsChatFocused(true)}
                                aria-label="Expand chat"
                                title="Expand"
                                className="h-8 w-8"
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                        )
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            setIsChatOpen(false);
                            setIsChatFocused(false);
                        }}
                        aria-label="Close chat"
                        title="Close"
                        className="h-8 w-8"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {rightTab === 'chat' ? (
                <>
                    <ScrollArea className="flex-1 px-3 md:px-6" ref={chatScrollRef as any}>
                        <div className="flex flex-col gap-4 py-6 min-w-0 pr-2">
                            {(messages as Message[]).map((m, idx) => (
                                <ChatMessage message={m as any} key={idx} />
                            ))}
                        </div>
                    </ScrollArea>

                    <div className="p-6 border-t bg-background">
                        <form
                            className="relative"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!isSending) handleSend();
                            }}
                        >
                            <Textarea
                                ref={chatInputRef}
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (!isSending) handleSend();
                                    }
                                }}
                                placeholder={
                                    selectionContext
                                        ? 'Ask about the selected excerpt…'
                                        : 'Ask about this draft…'
                                }
                                rows={1}
                                className="w-full rounded-lg pl-4 pr-24 py-3 text-base resize-none focus-visible:ring-primary"
                            />
                            <Button
                                type="submit"
                                size="sm"
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                                disabled={isSending}
                            >
                                Send
                            </Button>
                        </form>
                    </div>
                </>
            ) : rightTab === 'insights' ? (
                <div className="flex-1 min-h-0 p-0">
                    {/* Avoid extra nested borders; the panel already has a border container. */}
                    <ArtifactsPanel
                        artifacts={workspaceArtifacts}
                        onPromote={(statement: string) => {
                            const s = (statement || '').trim();
                            if (!s) return;
                            void startProof(s);
                        }}
                        isExtracting={Boolean(workspaceInsightsIsExtracting)}
                        edits={workspaceArtifactEdits}
                        setEdit={setWorkspaceArtifactEdit}
                    />
                </div>
            ) : (
                <ScrollArea className="flex-1 px-3 md:px-6">
                    <div className="py-6">
                        <WorkspacePreview content={doc || ''} />
                    </div>
                </ScrollArea>
            )}
        </div>
    );

    return (
        <div className="inset-0 absolute overflow-hidden flex">
            {/* Left sidebar (match Proof mode) */}
            <aside className="w-14 flex flex-col items-center py-4 border-r bg-card shrink-0">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".tex,text/plain"
                    className="hidden"
                    onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        await onImport(f);
                        // Reset input value so selecting the same file again retriggers onChange.
                        // Note: after an await, React may have nulled the synthetic event.
                        if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                />

                <div className="mb-6 cursor-pointer" onClick={() => goHome()}>
                    <LogoSmall />
                </div>

                <div className="flex flex-col items-center space-y-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        title={lastViewBeforeWorkspace === 'proof' ? 'Back to Prove' : lastViewBeforeWorkspace === 'explore' ? 'Back to Explore' : 'Back'}
                        onClick={() => {
                            // Prefer browser history navigation so the browser Back button works too.
                            try {
                                const st = (window.history.state || {}) as any;
                                if (st?.adjointInternal) {
                                    window.history.back();
                                    return;
                                }
                            } catch {
                                // ignore
                            }
                            returnFromWorkspace();
                        }}
                    >
                        <ArrowLeft />
                        <span className="sr-only">Back</span>
                    </Button>

                    <Button
                        data-workspace-action="import"
                        variant="ghost"
                        size="icon"
                        title="Import"
                        onClick={() => fileInputRef.current?.click()}
                        className={hoverHint === 'import' ? 'ring-1 ring-primary/25' : undefined}
                    >
                        <FileUp />
                        <span className="sr-only">Import</span>
                    </Button>

                    <Button
                        data-workspace-action="chat"
                        variant="ghost"
                        size="icon"
                        title="Chat"
                        onClick={() => {
                            if (isReviewMode) lastNonReviewTabRef.current = 'chat';
                            setIsChatOpen((prev) => (prev && rightTab === 'chat' ? false : true));
                            setRightTab('chat');
                        }}
                        className={cn(
                            isChatOpen ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : '',
                            hoverHint === 'chat' ? 'ring-1 ring-primary/25' : '',
                        )}
                    >
                        <MessageCircle />
                        <span className="sr-only">Chat</span>
                    </Button>

                    <Button
                        data-workspace-action="preview"
                        variant="ghost"
                        size="icon"
                        title="Preview"
                        onClick={() => {
                            if (isReviewMode) lastNonReviewTabRef.current = 'preview';
                            setIsChatOpen((prev) => (prev && rightTab === 'preview' ? false : true));
                            setRightTab('preview');
                        }}
                        className={cn(
                            isChatOpen && rightTab === 'preview'
                                ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
                                : '',
                            hoverHint === 'preview' ? 'ring-1 ring-primary/25' : '',
                        )}
                    >
                        <Eye />
                        <span className="sr-only">Preview</span>
                    </Button>

                    <Button
                        data-workspace-action="review"
                        variant="ghost"
                        size="icon"
                        title="Review"
                        onClick={() => {
                            if (rightTab === 'review') {
                                setRightTab(lastNonReviewTabRef.current ?? 'chat');
                                // remain in editor mode; keep side panel closed by default
                                setIsChatOpen(false);
                                setIsChatFocused(false);
                                return;
                            }

                            // entering review mode: remember last non-review right panel tab
                            if (rightTab === 'chat' || rightTab === 'insights' || rightTab === 'preview') {
                                lastNonReviewTabRef.current = rightTab;
                            }
                            setRightTab('review');
                            setIsChatOpen(false);
                            setIsChatFocused(false);
                        }}
                        className={cn(
                            isReviewMode ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : '',
                            hoverHint === 'review' ? 'ring-1 ring-primary/25' : '',
                        )}
                    >
                        <CheckSquare />
                        <span className="sr-only">Review</span>
                    </Button>

                    <Button
                        data-workspace-action="export"
                        variant="ghost"
                        size="icon"
                        title="Export"
                        onClick={onExport}
                        className={hoverHint === 'export' ? 'ring-1 ring-primary/25' : undefined}
                    >
                        <Download />
                        <span className="sr-only">Export</span>
                    </Button>
                </div>
                <div className="flex-1" />
            </aside>

            <div className="flex-1 min-h-0 flex overflow-hidden">
                <main className="flex-1 min-w-0 min-h-0 overflow-hidden p-3">
                    {isReviewMode ? (
                        <div className="h-full rounded-lg border bg-background overflow-hidden">
                            <WorkspaceReviewPanel />
                        </div>
                    ) : (
                        <>
                            <div className="mb-3">
                                <WorkspaceNextStepsCallout />
                            </div>
                            <div
                                className={cn(
                                    'h-full rounded-lg border bg-background overflow-hidden',
                                    isEditorDragOver ? 'ring-2 ring-primary/40 border-primary/30' : '',
                                )}
                                data-local-selection="1"
                                data-selection-enabled="1"
                                onDragEnter={(e) => {
                                    // Only react to text drags.
                                    if (!e.dataTransfer?.types?.includes('text/plain')) return;
                                    setIsEditorDragOver(true);
                                }}
                                onDragOver={(e) => {
                                    if (!e.dataTransfer?.types?.includes('text/plain')) return;
                                    // Required to allow drop.
                                    e.preventDefault();
                                    try {
                                        e.dataTransfer.dropEffect = 'copy';
                                    } catch {
                                        // ignore
                                    }
                                }}
                                onDragLeave={() => setIsEditorDragOver(false)}
                                onDrop={(e) => {
                                    setIsEditorDragOver(false);
                                    const view = cmRef.current?.view;
                                    if (!view) return;

                                    e.preventDefault();
                                    const text = String(e.dataTransfer?.getData('text/plain') ?? '');
                                    if (!text) return;

                                    // Prefer dropping at mouse location.
                                    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.from;

                                    view.dispatch({
                                        changes: { from: pos, to: pos, insert: text },
                                        selection: { anchor: pos + text.length },
                                    });
                                    view.focus();
                                }}
                            >
                                <CodeMirror
                                    ref={cmRef}
                                    value={doc}
                                    onChange={(val) => setDoc(val)}
                                    onMouseUp={onMouseUp as any}
                                    onKeyUp={onMouseUp as any}
                                    placeholder="Type LaTeX here…"
                                    extensions={cmExtensions}
                                    theme="dark"
                                    basicSetup={{
                                        lineNumbers: false,
                                        foldGutter: false,
                                        highlightActiveLine: false,
                                        highlightSelectionMatches: false,
                                    }}
                                    className="h-full [&_.cm-editor]:h-full"
                                />
                            </div>

                            {selection.anchor && (
                                <SelectionToolbar
                                    anchor={selection.anchor}
                                    selectedText={selection.text}
                                    copyText={selection.text}
                                    onRevise={() => { }}
                                    canCheckAgain={false}
                                    showCheckAgain={false}
                                    showRevise={false}
                                    showCopy={true}
                                    showAskAI={true}
                                    showProveThis={true}
                                    showAddToReview={true}
                                    onProveThis={() => openProveModalFromSelection()}
                                    onAddToReview={({ selectionLatex }) => {
                                        const view = cmRef.current?.view;
                                        if (!view) return;

                                        const sel = view.state.selection.main;
                                        const from = sel.from;
                                        const to = sel.to;
                                        if (from === to) return;

                                        const { statement, proof } = splitSelectionIntoStatementAndProof(selectionLatex);
                                        const env = 'claim';
                                        const body = statement.trim();
                                        const proofBody = (proof ?? '').trim();

                                        const block = proofBody
                                            ? `\\begin{${env}}\n${body}\n\\end{${env}}\n\n${proofBody}`
                                            : `\\begin{${env}}\n${body}\n\\end{${env}}`;

                                        view.dispatch({
                                            changes: { from, to, insert: block },
                                            selection: { anchor: from + block.length },
                                        });
                                        view.focus();

                                        // Switch to Review mode so the user sees the newly created artifact.
                                        try {
                                            setRightTab('review');
                                            setIsChatOpen(false);
                                            setIsChatFocused(false);
                                        } catch {
                                            // ignore
                                        }
                                    }}
                                    onAskAI={() => {
                                        // Open chat and prefill with the selected excerpt.
                                        setDraft(selection.text, { open: true });
                                        setRightTab('chat');
                                        setIsChatOpen(true);
                                    }}
                                />
                            )}

                            <Dialog
                                open={isProveOpen}
                                onOpenChange={(open) => {
                                    setIsProveOpen(open);
                                }}
                            >
                                <DialogContent className="sm:max-w-[720px]">
                                    <DialogHeader>
                                        <DialogTitle>Attempt proof with AI?</DialogTitle>
                                    </DialogHeader>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="prove-payload" className="flex items-center gap-2">
                                                    Inferred Statement
                                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                                </Label>
                                            </div>
                                            <Textarea
                                                id="prove-payload"
                                                value={provePayload}
                                                onChange={(e) => setProvePayload(e.target.value)}
                                                rows={6}
                                                className="font-mono text-xs"
                                            />
                                        </div>

                                        <div className="flex flex-col gap-3 rounded-md border p-3">
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id="prove-include-context"
                                                    checked={proveIncludeContext}
                                                    onCheckedChange={(v) => setProveIncludeContext(Boolean(v))}
                                                />
                                                <Label htmlFor="prove-include-context">Add preceding context</Label>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id="prove-strip-macros"
                                                    checked={proveStripMacros}
                                                    onCheckedChange={(v) => {
                                                        const next = Boolean(v);
                                                        setProveStripMacros(next);
                                                        // Recompute previews with the new mode.
                                                        const selected = (selection.text || '').trim();
                                                        const body = next ? stripLatexPreambleAndMacros(selected) : selected;
                                                        const ctx = contextBeforeSelection({
                                                            doc: doc || '',
                                                            selectionStart: selection.start,
                                                            maxChars: 6000,
                                                            stripMacros: next,
                                                        });
                                                        setProveStatement(body);
                                                        setProveContextPreview(ctx);
                                                    }}
                                                />
                                                <Label htmlFor="prove-strip-macros">Strip macros/preamble from context</Label>
                                            </div>

                                            {/* Inferred payload is always editable. */}
                                        </div>
                                    </div>

                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() => setIsProveOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                const payload = (provePayload || '').trim();
                                                if (!payload) return;
                                                setIsProveOpen(false);
                                                clearSelection();
                                                // Switch to dedicated prover mode.
                                                void startProof(payload);
                                            }}
                                        >
                                            Continue
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </>
                    )}
                </main>

                {/* Draggable divider + Right panel */}
                <div className={cn('relative shrink-0 h-full', isChatOpen && !isReviewMode ? '' : 'w-0')}
                    style={{ width: isChatOpen ? rightWidth : 0 }}
                >
                    {/* Drag handle */}
                    {isChatOpen && !isReviewMode && (
                        <div
                            className="absolute left-0 top-0 h-full w-2 -translate-x-1 cursor-col-resize"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize side panel"
                            onMouseDown={(e) => {
                                isDraggingRef.current = true;
                                dragStartXRef.current = e.clientX;
                                dragStartWidthRef.current = rightWidth;
                                try {
                                    document.body.style.cursor = 'col-resize';
                                    document.body.style.userSelect = 'none';
                                } catch {
                                    // ignore
                                }
                            }}
                        >
                            {/* subtle visual line */}
                            <div className="h-full w-px bg-border/60 ml-1" />
                        </div>
                    )}

                    <aside
                        className={cn(
                            // Keep this as a true right sidebar (not full-screen)
                            'h-full min-h-0 border-l bg-background overflow-hidden transition-all flex flex-col p-3',
                            isChatOpen ? '' : 'w-0 p-0 border-l-0',
                        )}
                    >
                        {isChatOpen && !isReviewMode && !isChatFocused && ChatPanel}
                    </aside>
                </div>
            </div>

            {/* Focus overlay (chat only) */}
            {isChatOpen && !isReviewMode && isChatFocused && rightTab === 'chat' && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
                    role="dialog"
                    aria-modal={true}
                    onClick={() => setIsChatFocused(false)}
                >
                    <div
                        className="w-full max-w-[85vw] h-[85vh] bg-background border rounded-lg shadow-lg overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {ChatPanel}
                    </div>
                </div>
            )}
        </div>
    );
}
