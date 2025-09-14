'use client';
import { useState, useTransition, useRef, useEffect } from 'react';
import { Send, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { reviseOrAskAction } from '@/app/actions';
import { KatexRenderer } from './katex-renderer';
import { Avatar, AvatarFallback } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  suggestion?: {
    revisedSublemmas: Sublemma[];
    isHandled: boolean;
  }
};

interface InteractiveChatProps {
  problem: string;
  sublemmas: Sublemma[];
  onProofRevision: (newSublemmas: Sublemma[]) => void;
  messages: Message[];
  setMessages: (messages: Message[]) => void;
}

export function InteractiveChat({
  problem,
  sublemmas,
  onProofRevision,
  messages,
  setMessages,
}: InteractiveChatProps) {
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollableNode =
        scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableNode) {
        scrollableNode.scrollTo({
          top: scrollableNode.scrollHeight,
          behavior: 'smooth',
        });
      }
    }
  }, [messages]);

  const handleSuggestion = (messageIndex: number, accept: boolean) => {
    const message = messages[messageIndex];
    if (!message || !message.suggestion) return;

    if (accept) {
      onProofRevision(message.suggestion.revisedSublemmas);
    }

    // Mark suggestion as handled
    const newMessages = [...messages];
    newMessages[messageIndex] = {
      ...message,
      suggestion: {
        ...message.suggestion,
        isHandled: true,
      },
      content: `${message.content}\n\n*Suggestion ${accept ? 'accepted' : 'declined'} by user.*`
    };
    setMessages(newMessages);
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    const request = input;
    setInput('');

    startTransition(async () => {
      const result = await reviseOrAskAction(problem, sublemmas, request);
      if (result.success) {
        const assistantMessage: Message = { role: 'assistant', content: result.explanation };
        if (result.revisionType === 'DIRECT_REVISION' && result.revisedSublemmas) {
          onProofRevision(result.revisedSublemmas);
        } else if (result.revisionType === 'SUGGESTED_REVISION' && result.revisedSublemmas) {
            assistantMessage.suggestion = {
                revisedSublemmas: result.revisedSublemmas,
                isHandled: false,
            };
        }
        setMessages((prevMessages) => [...prevMessages, assistantMessage]);
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to get an answer.',
          variant: 'destructive',
        });
        // On error, the user's message remains visible as it was set before the transition
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
        <div className="space-y-4 pt-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-3 text-sm ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
              )}
              <div
                className={`p-3 rounded-lg max-w-xl ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <KatexRenderer content={msg.content} />
                {msg.suggestion && !msg.suggestion.isHandled && (
                    <div className="mt-4 pt-3 border-t border-muted-foreground/20 flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => handleSuggestion(index, true)}>
                            <ThumbsUp className='mr-2' /> Accept Change
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleSuggestion(index, false)}>
                            <ThumbsDown className='mr-2'/> Decline
                        </Button>
                    </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-6 border-t bg-background">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isPending) handleSend();
              }
            }}
            placeholder="Revise the proof or ask a question..."
            rows={1}
            className="w-full rounded-lg pl-4 pr-12 py-3 text-base resize-none focus-visible:ring-primary"
            disabled={isPending}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleSend}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-primary"
            disabled={isPending}
            aria-label="Send message"
          >
            {isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
