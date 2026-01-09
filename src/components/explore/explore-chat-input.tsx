'use client';

import { Textarea } from '@/components/ui/textarea';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useSendExploreMessage } from '@/components/explore/useSendExploreMessage';
import { useAppStore } from '@/state/app-store';

export function ExploreChatInput() {
    const sendMessage = useSendExploreMessage();
    const [isSendingMessage, startSendMessage] = useTransition();
    const [input, setInput] = useState('');
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

    const handleSend = () => {
        const trimmed = input.trim();
        if (!trimmed) return;

        // Note: we intentionally do NOT open the chooser here.
        // If this is a proof request, the send hook will:
        //   1) run extract-only (to ensure a statement exists)
        //   2) then open the chooser (option 2 UX)

        startSendMessage(() => sendMessage(trimmed));
        setInput('');
    };


    return (
        <div className="p-4 border-t bg-background">
            <form
                className="relative"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!isSendingMessage) handleSend();
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
                            if (!isSendingMessage) handleSend();
                        }
                    }}
                    placeholder="Explore a statement, ask for examples/counterexamples, refine assumptions…"
                    rows={1}
                    className="w-full rounded-lg pl-4 pr-12 py-3 text-base resize-none focus-visible:ring-primary"
                />
                <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    disabled={isSendingMessage}
                    aria-label="Send message"
                >
                    <Send className="h-5 w-5" />
                </Button>
            </form>
        </div>
    );
}
