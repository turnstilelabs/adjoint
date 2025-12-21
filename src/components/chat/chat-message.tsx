import { Message } from '@/components/chat/interactive-chat';
import { KatexRenderer } from '@/components/katex-renderer';
import ChatTypingIndicator from '@/components/chat/chat-typing-indicator';
import MessageSuggestionSection from '@/components/chat/message/message-suggestion-section';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

function ChatMessage({ message }: { message: Message }) {
  const attemptProofAction = message.actions?.find((a) => a.type === 'attempt_proof');
  const showAttemptProof = Boolean(attemptProofAction);

  return (
    <div
      className={`flex gap-3 text-sm items-end ${message.role === 'user' ? 'justify-end' : 'justify-start'
        }`}
    >
      <div
        className={`p-4 rounded-2xl break-words max-w-full overflow-x-auto ${message.role === 'user'
            ? 'bg-primary text-primary-foreground shadow-md'
            : 'bg-card border border-border shadow-sm'
          }`}
      >
        {message.role === 'assistant' && (
          <div className="text-xs text-muted-foreground mb-1 font-medium">The Adjoint</div>
        )}
        <KatexRenderer content={message.content} autoWrap={false} />

        {showAttemptProof && (
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('explore:open-attempt-proof-chooser'));
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {attemptProofAction?.label ?? 'Attempt Proof'}
            </Button>
          </div>
        )}

        {message.isTyping && (
          <div className="mt-2 space-y-2">
            <ChatTypingIndicator />
            <div className="mt-3">
              <div className="mt-1 h-2 w-40 bg-muted rounded animate-pulse" />
              <div className="mt-1 h-2 w-64 bg-muted rounded animate-pulse" />
            </div>
          </div>
        )}
        <MessageSuggestionSection message={message} />
      </div>
    </div>
  );
}

export default ChatMessage;
