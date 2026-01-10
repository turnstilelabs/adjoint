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
import { Download, MessageCircle, FileUp, Sparkles, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LogoSmall } from '@/components/logo-small';

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

    const draft = useAppStore((s) => s.workspaceDraft);
    const draftNonce = useAppStore((s) => s.workspaceDraftNonce);
    const setDraft = useAppStore((s) => s.setWorkspaceDraft);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const cmRef = useRef<ReactCodeMirrorRef | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const chatScrollRef = useRef<HTMLDivElement | null>(null);
    const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

    // Selection state for floating toolbar.
    const [selection, setSelection] = useState<{
        text: string;
        anchor: Anchor | null;
        start: number;
        end: number;
    }>({ text: '', anchor: null, start: 0, end: 0 });

    const clearSelection = () => setSelection({ text: '', anchor: null, start: 0, end: 0 });

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
                        onClick={() => setIsChatOpen((p) => !p)}
                        className={isChatOpen ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : ''}
                    >
                        <MessageCircle />
                        <span className="sr-only">Chat</span>
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
                            onAskAI={() => {
                                // Open chat and prefill with the selected excerpt.
                                setDraft(selection.text, { open: true });
                                setIsChatOpen(true);
                            }}
                        />
                    )}
                </main>

                <aside
                    className={cn(
                        // Keep this as a true right sidebar (not full-screen)
                        'relative shrink-0 min-h-0 h-full border-l bg-background overflow-hidden transition-all flex flex-col p-3',
                        isChatOpen ? 'w-[28rem]' : 'w-0',
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
                                        placeholder={selectionContext ? 'Ask about the selected excerpt…' : 'Ask about this draft…'}
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
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
