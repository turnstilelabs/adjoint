import type { DragEvent } from 'react';

import { Message } from '@/components/chat/interactive-chat';
import { KatexRenderer } from '@/components/katex-renderer';
import ChatTypingIndicator from '@/components/chat/chat-typing-indicator';
import MessageSuggestionSection from '@/components/chat/message/message-suggestion-section';
import { Button } from '@/components/ui/button';
import { GripVertical, Sparkles } from 'lucide-react';

function ChatMessage({ message, autoWrapMath = false }: { message: Message; autoWrapMath?: boolean }) {
  const attemptProofAction = message.actions?.find((a) => a.type === 'attempt_proof');
  const showAttemptProof = Boolean(attemptProofAction);

  const onDragStart = (e: DragEvent) => {
    try {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', String(message.content ?? ''));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`flex w-full gap-3 text-sm items-end min-w-0 ${message.role === 'user' ? 'justify-end' : 'justify-start'
        }`}
    >
      <div
        className={`group relative p-4 rounded-2xl break-words w-fit max-w-[85%] min-w-0 ${message.role === 'user'
          ? 'bg-primary text-primary-foreground shadow-md'
          : 'bg-card border border-border shadow-sm'
          }`}
        data-selection-enabled="1"
      >
        {/* Drag handle (shown on hover). Only this handle is draggable to avoid breaking text selection. */}
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag message into editor"
          title="Drag into editor"
          className={
            'absolute right-2 top-2 rounded-md p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100'
          }
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {message.role === 'assistant' && (
          <div className="text-xs text-muted-foreground mb-1 font-medium">The Adjoint</div>
        )}
        <KatexRenderer content={message.content} autoWrap={autoWrapMath} />

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
