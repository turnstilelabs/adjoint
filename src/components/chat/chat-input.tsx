import { Textarea } from '@/components/ui/textarea';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useSendMessage } from '@/components/chat/useSendMessage';
import { useAppStore } from '@/state/app-store';

function ChatInput() {
  const sendMessage = useSendMessage();
  const [isSendingMessage, startSendMessage] = useTransition();
  const [input, setInput] = useState('');
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
    startSendMessage(() => sendMessage(input.trim()));
    setInput('');
  };

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
              if (!isSendingMessage) handleSend();
            }
          }}
          placeholder="Revise the proof or ask a question..."
          rows={1}
          className="w-full rounded-lg pl-4 pr-12 py-3 text-base resize-none focus-visible:ring-primary"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSend}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          disabled={isSendingMessage}
          aria-label="Send message"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

export default ChatInput;
