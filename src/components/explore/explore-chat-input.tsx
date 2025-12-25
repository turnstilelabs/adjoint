'use client';

import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useSendExploreMessage } from '@/components/explore/useSendExploreMessage';

export function ExploreChatInput() {
    const sendMessage = useSendExploreMessage();
    const [isSendingMessage, startSendMessage] = useTransition();
    const [input, setInput] = useState('');

    useEffect(() => {
        // No-op: previously we had a keyboard fallback to open the proof chooser.
        // We now delay opening until extract-only completes.
        return;
    }, []);

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
