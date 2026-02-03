'use client';

import { Textarea } from '@/components/ui/textarea';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { useSendExploreMessage } from '@/components/explore/useSendExploreMessage';
import { useAppStore } from '@/state/app-store';

export function ExploreChatInput() {
    const sendMessage = useSendExploreMessage();
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [input, setInput] = useState('');
    const cancelExploreCurrent = useAppStore((s) => s.cancelExploreCurrent);
    const draft = useAppStore((s) => s.exploreDraft);
    const draftNonce = useAppStore((s) => s.exploreDraftNonce);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        // No-op: previously we had a keyboard fallback to open the proof chooser.
        // We now delay opening until extract-only completes.
        return;
    }, []);

    // When the global selection toolbar requests an "Ask AI", prefill + focus.
    useEffect(() => {
        if (!draftNonce) return;
        const next = String(draft ?? '');
        setInput(next);
        try {
            requestAnimationFrame(() => {
                textareaRef.current?.focus();
                const len = next.length;
                textareaRef.current?.setSelectionRange(len, len);
            });
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftNonce]);

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed) return;

        // Cancel any in-flight request so we don't overlap streams.
        try {
            cancelExploreCurrent?.();
        } catch {
            // ignore
        }

        // Note: we intentionally do NOT open the chooser here.
        // If this is a proof request, the send hook will:
        //   1) run extract-only (to ensure a statement exists)
        //   2) then open the chooser (option 2 UX)
        setIsSendingMessage(true);
        setInput('');
        try {
            await sendMessage(trimmed);
        } finally {
            setIsSendingMessage(false);
        }
    };

    const isStreaming = Boolean(cancelExploreCurrent);


    return (
        <div className="p-4 border-t bg-background">
            <form
                className="relative"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!isStreaming) handleSend();
                }}
            >
                <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter sends; Shift+Enter inserts newline.
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!isStreaming) handleSend();
                        }
                    }}
                    placeholder="Explore a statement, ask for examples/counterexamples, refine assumptions…"
                    rows={1}
                    className="w-full rounded-lg pl-4 pr-32 py-3 text-base resize-none focus-visible:ring-primary"
                />

                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            if (isStreaming) {
                                try {
                                    cancelExploreCurrent?.();
                                } catch {
                                    // ignore
                                }
                                return;
                            }
                            void handleSend();
                        }}
                        aria-label={isStreaming ? 'Stop generating' : 'Send message'}
                    >
                        {isStreaming ? <Square className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                    </Button>
                </div>
            </form>
        </div>
    );
}
