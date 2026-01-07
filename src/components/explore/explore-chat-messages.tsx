'use client';

import { useAppStore } from '@/state/app-store';
import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChatMessage from '@/components/chat/chat-message';
import type { Message } from '@/components/chat/interactive-chat';

export function ExploreChatMessages() {
    const messages = useAppStore((s) => s.exploreMessages);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollAreaRef.current) {
            const scrollableNode = scrollAreaRef.current.querySelector(
                'div[data-radix-scroll-area-viewport]',
            );
            if (scrollableNode) {
                scrollableNode.scrollTo({
                    top: scrollableNode.scrollHeight,
                    behavior: 'smooth',
                });
            }
        }
    }, [messages]);

    return (
        <ScrollArea className="flex-1 px-3 md:px-6" ref={scrollAreaRef}>
            <div className="flex flex-col gap-4 py-6">
                {(messages as Message[]).map((message, index) => (
                    <ChatMessage message={message} autoWrapMath key={index} />
                ))}
            </div>
        </ScrollArea>
    );
}
