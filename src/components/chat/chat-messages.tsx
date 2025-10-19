import { useAppStore } from '@/state/app-store';
import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChatMessage from '@/components/chat/chat-message';

function ChatMessages() {
  const messages = useAppStore((s) => s.messages);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on every message change
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
    <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
      <div className="space-y-4 pt-4">
        {messages.map((message, index) => (
          <ChatMessage message={message} key={index} />
        ))}
      </div>
    </ScrollArea>
  );
}

export default ChatMessages;
