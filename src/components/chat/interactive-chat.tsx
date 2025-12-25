'use client';

import { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import ChatInput from '@/components/chat/chat-input';
import ChatMessages from '@/components/chat/chat-messages';

export type MessageAction =
  | {
    type: 'attempt_proof';
    label?: string;
  };

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  /** Optional lightweight CTAs rendered under the message bubble. */
  actions?: MessageAction[];
  suggestion?: {
    revisedSublemmas: Sublemma[];
    prevSublemmas?: Sublemma[];
    isHandled: boolean;
    status?: 'accepted' | 'declined' | 'reverted';
    updated?: boolean;
  };
  isTyping?: boolean;
  offTopic?: boolean;
  noImpact?: boolean;
};

export function InteractiveChat() {
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFocused(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocused]);

  return (
    <div
      className={
        isFocused
          ? 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center'
          : 'relative flex-1 flex flex-col overflow-hidden'
      }
      onClick={() => isFocused && setIsFocused(false)}
      role={isFocused ? 'dialog' : undefined}
      aria-modal={isFocused ? true : undefined}
    >
      <div
        className={
          isFocused
            ? 'w-full max-w-[85vw] h-[85vh] bg-background border rounded-lg shadow-lg flex flex-col overflow-hidden'
            : 'flex-1 flex flex-col overflow-hidden'
        }
        onClick={(e) => {
          if (isFocused) e.stopPropagation();
        }}
      >
        <div className="px-3 py-2 border-b backdrop-blur flex items-center justify-between">
          <div
            className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
            onClick={() => setIsFocused((v) => !v)}
          >
            Chat
          </div>
          {isFocused ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reduce to panel"
              onClick={() => setIsFocused(false)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Expand chat"
              onClick={() => setIsFocused(true)}
            >
              <Maximize2 className="invisible md:visible h-4 w-4" />
            </Button>
          )}
        </div>
        <ChatMessages />
        <ChatInput />
      </div>
    </div>
  );
}
