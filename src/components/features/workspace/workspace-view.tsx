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
import { Download, MessageCircle, FileUp, Sparkles, X, Eye, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LogoSmall } from '@/components/logo-small';
import { WorkspacePreview } from '@/components/features/workspace/workspace-preview';
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

    const messages = useAppStore((s) => s.workspaceMessages);
    const setMessages = useAppStore((s) => s.setWorkspaceMessages);

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

        setMessages((prev) => [...prev, userMsg, typing]);

        startSending(async () => {
            await send(
                {
                    request: trimmed,
                    selectionText,
                    contextText,
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
        if (rightTab !== 'chat' && rightTab !== 'preview') {
            setIsChatOpen(false);
        }
    }, [isChatOpen, rightTab, setIsChatOpen]);

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
                        title="Import"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <FileUp />
                        <span className="sr-only">Import</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        title="Chat"
                        onClick={() => {
                            setIsChatOpen((prev) => (prev && rightTab === 'chat' ? false : true));
                            setRightTab('chat');
                        }}
                        className={isChatOpen ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : ''}
                    >
                        <MessageCircle />
                        <span className="sr-only">Chat</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        title="Preview"
                        onClick={() => {
                            setIsChatOpen((prev) => (prev && rightTab === 'preview' ? false : true));
                            setRightTab('preview');
                        }}
                        className={
                            isChatOpen && rightTab === 'preview'
                                ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
                                : ''
                        }
                    >
                        <Eye />
                        <span className="sr-only">Preview</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        title="Prove"
                        onClick={() => {
                            const raw = (doc || '').trim();
                            if (!raw) {
                                toast({
                                    title: 'Nothing to prove yet',
                                    description: 'Write or import a proof draft first.',
                                });
                                return;
                            }

                            // Best-effort: if the draft starts with \begin{proof}, keep it.
                            // Otherwise, wrap it to help downstream parsing.
                            const body = raw.includes('\\begin{proof}') ? raw : `\\begin{proof}\n${raw}\n\\end{proof}`;
                            void startProof(body);
                        }}
                    >
                        <Sparkles />
                        <span className="sr-only">Prove</span>
                    </Button>

                    <Button variant="ghost" size="icon" title="Export" onClick={onExport}>
                        <Download />
                        <span className="sr-only">Export</span>
                    </Button>
                </div>
                <div className="flex-1" />
            </aside>

            <div className="flex-1 min-h-0 flex overflow-hidden">
                <main className="flex-1 min-w-0 min-h-0 overflow-hidden p-3">
                    <div
                        className="h-full rounded-lg border bg-background overflow-hidden"
                        data-local-selection="1"
                        data-selection-enabled="1"
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
                            onProveThis={() => openProveModalFromSelection()}
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
                </main>

                {/* Draggable divider + Right panel */}
                <div className={cn('relative shrink-0 h-full', isChatOpen ? '' : 'w-0')}
                    style={{ width: isChatOpen ? rightWidth : 0 }}
                >
                    {/* Drag handle */}
                    {isChatOpen && (
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
                        {isChatOpen && (
                            <div className="relative h-full rounded-lg border bg-background overflow-hidden flex flex-col">
                                {/* Close button overlays so we keep full height */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsChatOpen(false)}
                                    aria-label="Close chat"
                                    title="Close"
                                    className="absolute right-2 top-2 z-10"
                                >
                                    <X className="h-4 w-4" />
                                </Button>

                                {rightTab === 'chat' ? (
                                    <>
                                        <ScrollArea className="flex-1 px-3 md:px-6" ref={chatScrollRef as any}>
                                            <div className="flex flex-col gap-4 py-6">
                                                {(messages as Message[]).map((m, idx) => (
                                                    <ChatMessage message={m as any} autoWrapMath key={idx} />
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
                                ) : (
                                    <ScrollArea className="flex-1 px-3 md:px-6">
                                        <div className="py-6">
                                            <WorkspacePreview content={doc || ''} />
                                        </div>
                                    </ScrollArea>
                                )}
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}
