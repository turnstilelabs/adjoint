import { Textarea } from '@/components/ui/textarea';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { useSendMessage } from '@/components/chat/useSendMessage';
import { useAppStore } from '@/state/app-store';

function ChatInput() {
  const sendMessage = useSendMessage();
  const [input, setInput] = useState('');
  const cancelChatCurrent = useAppStore((s) => s.cancelChatCurrent);
  const draft = useAppStore((s) => s.chatDraft);
  const draftNonce = useAppStore((s) => s.chatDraftNonce);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
    void sendMessage(input.trim());
    setInput('');
  };

  // Note: `useTransition` only tracks React state updates, but our streaming is mostly Zustand-driven.
  // Using the store-provided cancel handle is the most reliable signal that a stream is in-flight.
  const isStreaming = Boolean(cancelChatCurrent);

  return (
    <div className="p-6 border-t bg-background">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isStreaming) handleSend();
            }
          }}
          placeholder="Revise the proof or ask a question..."
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
                  cancelChatCurrent?.();
                } catch {
                  // ignore
                }
                return;
              }
              handleSend();
            }}
            aria-label={isStreaming ? 'Stop generating' : 'Send message'}
          >
            {isStreaming ? <Square className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
