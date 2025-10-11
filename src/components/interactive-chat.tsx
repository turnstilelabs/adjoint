import { useEffect, useRef, useState, useTransition } from 'react';
import { Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { KatexRenderer } from './katex-renderer';
import { ScrollArea } from './ui/scroll-area';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/state/app-store';

export type Message = {
  role: 'user' | 'assistant';
  content: string;
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

const TypingIndicator = () => (
  <div className="flex items-center gap-1 text-muted-foreground">
    <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
    <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
    <span className="w-2 h-2 bg-current rounded-full animate-bounce" />
  </div>
);

export function InteractiveChat({
  onProofRevision,
}: {
  onProofRevision: (newSublemmas: Sublemma[]) => void;
}) {
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const proof = useAppStore((s) => s.proof());
  const problem = useAppStore((s) => s.problem);
  const messages = useAppStore((s) => s.messages);

  const setMessages = useAppStore((s) => s.setMessages);

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

  const handleSuggestion = (messageIndex: number, accept: boolean) => {
    const message = messages[messageIndex];
    if (!message || !message.suggestion) return;

    const newMessages = [...messages];

    if (accept) {
      // Capture the current proof as a snapshot to enable revert
      const previous = proof.sublemmas;
      onProofRevision(message.suggestion.revisedSublemmas);
      newMessages[messageIndex] = {
        ...message,
        suggestion: {
          ...message.suggestion,
          prevSublemmas: previous,
          isHandled: true,
          status: 'accepted',
        },
      };
    } else {
      newMessages[messageIndex] = {
        ...message,
        suggestion: {
          ...message.suggestion,
          isHandled: true,
          status: 'declined',
        },
      };
    }

    setMessages(newMessages);
  };

  const handleRevert = (messageIndex: number) => {
    const message = messages[messageIndex];
    const prev = message?.suggestion?.prevSublemmas;
    if (!message || !message.suggestion || !prev) return;

    try {
      onProofRevision(prev);
      const newMessages = [...messages];
      newMessages[messageIndex] = {
        ...message,
        suggestion: {
          ...message.suggestion,
          isHandled: true,
          status: 'reverted',
        },
      };
      setMessages(newMessages);
    } catch {
      // no-op; ProofDisplay handles errors via toast where applicable
    }
  };

  const handleAdopt = (messageIndex: number) => {
    const message = messages[messageIndex];
    const proposal = message?.suggestion?.revisedSublemmas;
    if (!message || !message.suggestion || !proposal) return;

    try {
      // Snapshot current proof before adopting so we can revert again
      const previous = proof.sublemmas;
      onProofRevision(proposal);
      const newMessages = [...messages];
      newMessages[messageIndex] = {
        ...message,
        suggestion: {
          ...message.suggestion,
          prevSublemmas: previous,
          isHandled: true,
          status: 'accepted',
        },
      };
      setMessages(newMessages);
    } catch {
      // no-op
    }
  };

  const handleSend = () => {
    const request = input.trim();
    if (!request) return;

    const userMessage: Message = { role: 'user', content: request };
    const newMessages = [...messages, userMessage];
    const typingMessage: Message = {
      role: 'assistant',
      content: '',
      isTyping: true,
    };
    setMessages([...newMessages, typingMessage]);
    setInput('');

    startTransition(async () => {
      try {
        const history = newMessages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
        // Start authoritative impact in parallel with streaming
        const impactPromise = fetch('/api/chat/impact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem, proofSteps: proof.sublemmas, request }),
        });

        // Begin streaming free-form assistant text
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem, sublemmas: proof.sublemmas, request, history }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Failed to stream response.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let accumulated = '';

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = !!doneReading;
          if (value) {
            const chunk = decoder.decode(value, { stream: !done });
            accumulated += chunk;
            setMessages((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              const last = updated[lastIdx];
              updated[lastIdx] = {
                ...last,
                content: accumulated,
                isTyping: true,
              };
              return updated;
            });
          }
        }

        // Mark typing complete
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          const last = updated[lastIdx];
          updated[lastIdx] = { ...last, isTyping: false };
          return updated;
        });

        // Attach preliminary impact result (await parallel promise)
        let preliminary: {
          revisionType: 'DIRECT_REVISION' | 'SUGGESTED_REVISION' | 'NO_REVISION' | 'OFF_TOPIC';
          revisedSublemmas?: Sublemma[] | null;
        } | null = null;
        try {
          const ipRes = await impactPromise;
          if (ipRes.ok) {
            preliminary = await ipRes.json();
          }
        } catch {
          // ignore
        }

        if (preliminary) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            const last = updated[lastIdx];

            if (
              (preliminary!.revisionType === 'DIRECT_REVISION' ||
                preliminary!.revisionType === 'SUGGESTED_REVISION') &&
              preliminary!.revisedSublemmas &&
              preliminary!.revisedSublemmas.length > 0
            ) {
              updated[lastIdx] = {
                ...last,
                noImpact: false,
                offTopic: false,
                suggestion: {
                  revisedSublemmas: preliminary!.revisedSublemmas,
                  isHandled: false,
                },
              };
            } else if (preliminary!.revisionType === 'NO_REVISION') {
              updated[lastIdx] = {
                ...last,
                noImpact: true,
                offTopic: false,
                suggestion: undefined,
              };
            } else if (preliminary!.revisionType === 'OFF_TOPIC') {
              updated[lastIdx] = {
                ...last,
                offTopic: true,
                noImpact: false,
                suggestion: undefined,
              };
            }

            return updated;
          });
        } else {
          toast({
            title: 'Impact check failed',
            description: 'Could not classify effect on the proof.',
            variant: 'destructive',
          });
        }

        // Reconcile with assistant's final text to match exact wording
        const sameRevised = (a?: Sublemma[] | null, b?: Sublemma[] | null) => {
          if (!a && !b) return true;
          if (!a || !b) return false;
          if (a.length !== b.length) return false;
          for (let i = 0; i < a.length; i++) {
            if ((a[i].title || '') !== (b[i].title || '')) return false;
            if ((a[i].content || '') !== (b[i].content || '')) return false;
          }
          return true;
        };

        try {
          const recRes = await fetch('/api/chat/impact-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              problem,
              proofSteps: proof.sublemmas,
              assistantText: accumulated,
            }),
          });
          if (recRes.ok) {
            const reconciled = (await recRes.json()) as {
              revisionType: 'DIRECT_REVISION' | 'SUGGESTED_REVISION' | 'NO_REVISION' | 'OFF_TOPIC';
              revisedSublemmas?: Sublemma[] | null;
            };

            setMessages((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              const last = updated[lastIdx];

              // Do not override decisions already handled by the user
              if (last.suggestion?.isHandled) {
                return updated;
              }

              if (
                (reconciled.revisionType === 'DIRECT_REVISION' ||
                  reconciled.revisionType === 'SUGGESTED_REVISION') &&
                reconciled.revisedSublemmas &&
                reconciled.revisedSublemmas.length > 0
              ) {
                const currentRevised = last.suggestion?.revisedSublemmas;
                if (!sameRevised(currentRevised, reconciled.revisedSublemmas)) {
                  updated[lastIdx] = {
                    ...last,
                    noImpact: false,
                    offTopic: false,
                    suggestion: {
                      ...(last.suggestion || { isHandled: false }),
                      revisedSublemmas: reconciled.revisedSublemmas,
                      isHandled: false,
                      updated: true,
                    },
                  };
                }
              } else if (reconciled.revisionType === 'NO_REVISION') {
                if (!last.noImpact) {
                  updated[lastIdx] = {
                    ...last,
                    noImpact: true,
                    offTopic: false,
                    suggestion: undefined,
                  };
                }
              } else if (reconciled.revisionType === 'OFF_TOPIC') {
                if (!last.offTopic) {
                  updated[lastIdx] = {
                    ...last,
                    offTopic: true,
                    noImpact: false,
                    suggestion: undefined,
                  };
                }
              }

              return updated;
            });
          }
        } catch {
          // ignore reconciliation errors
        }
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to get an answer.',
          variant: 'destructive',
        });
        // On error, remove the user's message and typing indicator we previously appended.
        setMessages(messages);
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
              className={`flex gap-3 text-sm items-end ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* Assistant avatar removed per user request - name is shown above the message bubble */}
              <div
                className={`p-4 rounded-2xl max-w-xl break-words ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-muted border border-muted-foreground/10 shadow-sm'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="text-xs text-muted-foreground mb-1 font-medium">The Adjoint</div>
                )}
                <KatexRenderer content={msg.content} />
                {msg.isTyping && (
                  <div className="mt-2 space-y-2">
                    <TypingIndicator />
                    <div className="mt-3">
                      <div className="mt-1 h-2 w-40 bg-muted rounded animate-pulse" />
                      <div className="mt-1 h-2 w-64 bg-muted rounded animate-pulse" />
                    </div>
                  </div>
                )}
                {msg.suggestion && !msg.suggestion.isHandled && (
                  <div className="mt-4 pt-3 border-t border-muted-foreground/20">
                    <div className="mb-3">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Proposed proof changes (preview)
                        {msg.suggestion?.updated && (
                          <span className="ml-2 italic opacity-80">(updated)</span>
                        )}
                      </div>
                      <div className="space-y-2 max-h-64 overflow-auto pr-1">
                        {msg.suggestion.revisedSublemmas.map((s, i) => (
                          <div key={i} className="rounded border border-muted-foreground/10 p-2">
                            <div className="text-sm font-semibold">
                              {s.title || `Step ${i + 1}`}
                            </div>
                            <div className="text-sm">
                              <KatexRenderer content={s.content} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSuggestion(index, true)}
                      >
                        <ThumbsUp className="mr-2" /> Accept Proposed Changes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSuggestion(index, false)}
                      >
                        <ThumbsDown className="mr-2" /> Decline
                      </Button>
                    </div>
                  </div>
                )}
                {msg.noImpact && (
                  <p className="mt-4 pt-3 border-t border-muted-foreground/20 text-xs text-muted-foreground">
                    No impact on the proof.
                  </p>
                )}
                {msg.offTopic && (
                  <div className="mt-4 pt-3 border-t border-muted-foreground/20 flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => router.push('/')}>
                      Start new task
                    </Button>
                  </div>
                )}
                {msg.suggestion?.isHandled && msg.suggestion && (
                  <div className="mt-4 pt-3 border-t border-muted-foreground/20">
                    <div className="text-xs text-muted-foreground mb-2">
                      {msg.suggestion.status === 'accepted' && 'Accepted by user.'}
                      {msg.suggestion.status === 'declined' && 'Declined.'}
                      {msg.suggestion.status === 'reverted' && 'Reverted to previous version.'}
                    </div>
                    <div className="mb-3">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Proposed proof changes (preview)
                        {msg.suggestion?.updated && (
                          <span className="ml-2 italic opacity-80">(updated)</span>
                        )}
                      </div>
                      <div className="space-y-2 max-h-64 overflow-auto pr-1">
                        {msg.suggestion.revisedSublemmas.map((s, i) => (
                          <div key={i} className="rounded border border-muted-foreground/10 p-2">
                            <div className="text-sm font-semibold">
                              {s.title || `Step ${i + 1}`}
                            </div>
                            <div className="text-sm">
                              <KatexRenderer content={s.content} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {msg.suggestion.status === 'accepted' && (
                        <Button variant="secondary" size="sm" onClick={() => handleRevert(index)}>
                          Revert changes
                        </Button>
                      )}
                      {(msg.suggestion.status === 'declined' ||
                        msg.suggestion.status === 'reverted') && (
                        <Button variant="secondary" size="sm" onClick={() => handleAdopt(index)}>
                          Adopt proposal
                        </Button>
                      )}
                    </div>
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
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
