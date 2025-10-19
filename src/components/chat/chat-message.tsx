import { Message } from '@/components/chat/interactive-chat';
import { KatexRenderer } from '@/components/katex-renderer';
import ChatTypingIndicator from '@/components/chat/chat-typing-indicator';
import MessageSuggestionSection from '@/components/chat/message/message-suggestion-section';

function ChatMessage({ message }: { message: Message }) {
  return (
    <div
      className={`flex gap-3 text-sm items-end ${
        message.role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      <div
        className={`p-4 rounded-2xl break-words ${
          message.role === 'user'
            ? 'bg-primary text-primary-foreground shadow-md'
            : 'bg-white border border-muted-foreground/10 shadow-sm'
        }`}
      >
        {message.role === 'assistant' && (
          <div className="text-xs text-muted-foreground mb-1 font-medium">The Adjoint</div>
        )}
        <KatexRenderer content={message.content} autoWrap={false} />
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
