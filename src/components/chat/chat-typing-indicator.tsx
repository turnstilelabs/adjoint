function ChatTypingIndicator() {
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" />
    </div>
  );
}

export default ChatTypingIndicator;
