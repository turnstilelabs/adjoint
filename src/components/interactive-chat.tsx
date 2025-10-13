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

/**
 * Minimal diff between current proof and a proposed revision.
 * Aligns by index (fast) and flags only changed parts for display.
 * This keeps the preview concise and performant.
 */
type Change =
  | { kind: 'add'; at: number; step: Sublemma }
  | { kind: 'remove'; at: number; step: Sublemma }
  | {
    kind: 'modify';
    at: number;
    old: Sublemma;
    next: Sublemma;
    titleChanged?: boolean;
    statementChanged?: boolean;
    proofChanged?: boolean;
  };

function computeProofDiff(currentSteps: Sublemma[], revisedSteps: Sublemma[]): Change[] {
  const changes: Change[] = [];
  const maxLen = Math.max(currentSteps.length, revisedSteps.length);
  for (let i = 0; i < maxLen; i++) {
    const a = currentSteps[i];
    const b = revisedSteps[i];
    if (a && !b) {
      changes.push({ kind: 'remove', at: i, step: a });
    } else if (!a && b) {
      changes.push({ kind: 'add', at: i, step: b });
    } else if (a && b) {
      const titleChanged = (a.title || '') !== (b.title || '');
      const statementChanged = (a.statement || '') !== (b.statement || '');
      const proofChanged = (a.proof || '') !== (b.proof || '');
      if (titleChanged || statementChanged || proofChanged) {
        changes.push({ kind: 'modify', at: i, old: a, next: b, titleChanged, statementChanged, proofChanged });
      }
    }
  }
  return changes;
}

/**
 * Heuristics to interpret proposal payloads that may not include the full step list.
 * - If the proposal length equals current length, treat as full replacement.
 * - If it contains a single step, replace the inferred target step (by numeric prefix in title or default to last step).
 * - Otherwise, attempt a title-based overlay (keep unmatched steps unchanged).
 */
function inferTargetIndex(currentSteps: Sublemma[], revised: Sublemma[]): number | null {
  if (revised.length !== 1) return null;
  const t = (revised[0].title || '').trim();
  const m = t.match(/^\s*(?:Step\s*)?(\d+)[\.\)]?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n >= 1 && n <= currentSteps.length) return n - 1;
  }
  // Default heuristic: last step
  return currentSteps.length > 0 ? currentSteps.length - 1 : null;
}

function mergeRevised(currentSteps: Sublemma[], revised: Sublemma[]): Sublemma[] {
  if (revised.length === currentSteps.length) {
    return revised;
  }
  if (revised.length === 1) {
    const idx = inferTargetIndex(currentSteps, revised);
    if (idx !== null && idx >= 0 && idx < currentSteps.length) {
      const next = [...currentSteps];
      next[idx] = revised[0];
      return next;
    }
  }
  // Fallback: overlay by normalized titles
  const norm = (s: string) => (s || '').toLowerCase().replace(/^\s*(?:step\s*)?\d+[\.\)]?\s*/, '').trim();
  const curMap = new Map(currentSteps.map((s, i) => [norm(s.title || `step-${i + 1}`), { step: s, index: i }]));
  const next = [...currentSteps];
  let changed = false;
  for (const r of revised) {
    const key = norm(r.title || '');
    const found = curMap.get(key);
    if (found) {
      next[found.index] = r;
      changed = true;
    }
  }
  return changed ? next : currentSteps;
}

export function InteractiveChat() {
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const proof = useAppStore((s) => s.proof());
  const problem = useAppStore((s) => s.problem);
  const messages = useAppStore((s) => s.messages);

  const setMessages = useAppStore((s) => s.setMessages);
  const reset = useAppStore((s) => s.reset);

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

  const addProofVersion = useAppStore((s) => s.addProofVersion);

  const onProofRevision = (sublemmas: Sublemma[]) => addProofVersion({ sublemmas });

  const handleSuggestion = (messageIndex: number, accept: boolean) => {
    const message = messages[messageIndex];
    if (!message || !message.suggestion) return;

    const newMessages = [...messages];

    if (accept) {
      // Capture the current proof as a snapshot to enable revert
      const previous = sublemmas;
      const effective = mergeRevised(sublemmas, message.suggestion.revisedSublemmas);
      onProofRevision(effective);
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
      const previous = sublemmas;
      const effective = mergeRevised(sublemmas, proposal);
      onProofRevision(effective);
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
        const history = newMessages.slice(-8).map(m => ({ role: m.role, content: m.content }));

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
        let proposalHandled = false;

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

            // Attempt early proposal parsing during stream to avoid post-text delay
            const earlyMatch = accumulated.match(/[\r\n]\[\[PROPOSAL\]\]([\s\S]+)$/);
            if (earlyMatch && !proposalHandled) {
              const jsonText = earlyMatch[1].trim();
              try {
                const payload = JSON.parse(jsonText) as { revisedSublemmas?: Sublemma[] | null };
                const cleaned = accumulated.replace(/[\r\n]\[\[PROPOSAL\]\][\s\S]+$/, '');
                // Update message text immediately (remove control frame)
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  const last = updated[lastIdx];
                  updated[lastIdx] = { ...last, content: cleaned, isTyping: false };
                  return updated;
                });
                const revised = Array.isArray(payload?.revisedSublemmas)
                  ? (payload.revisedSublemmas as Sublemma[])
                  : [];
                if (revised.length > 0) {
                  setMessages(prev => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    const last = updated[lastIdx];
                    updated[lastIdx] = {
                      ...last,
                      noImpact: false,
                      offTopic: false,
                      suggestion: { revisedSublemmas: revised, isHandled: false },
                    };
                    return updated;
                  });
                } else {
                  setMessages(prev => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    const last = updated[lastIdx];
                    updated[lastIdx] = { ...last, noImpact: true, offTopic: false, suggestion: undefined };
                    return updated;
                  });
                }
                proposalHandled = true;
                try { await reader.cancel(); } catch { /* ignore */ }
                done = true;
              } catch {
                // ignore malformed in-flight proposal; final parsing will run after completion
              }
            }
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

        // Parse [[PROPOSAL]] control frame appended by the server
        const proposalMatch = accumulated.match(/[\r\n]\[\[PROPOSAL\]\]([\s\S]+)$/);
        if (proposalMatch) {
          const jsonText = proposalMatch[1].trim();
          try {
            const payload = JSON.parse(jsonText) as { revisedSublemmas?: Sublemma[] | null };
            const cleaned = accumulated.replace(/[\r\n]\[\[PROPOSAL\]\][\s\S]+$/, '');
            // Update last assistant message text without the control frame
            setMessages(prev => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              const last = updated[lastIdx];
              updated[lastIdx] = { ...last, content: cleaned, isTyping: false };
              return updated;
            });
            const revised = Array.isArray(payload?.revisedSublemmas)
              ? (payload.revisedSublemmas as Sublemma[])
              : [];
            if (revised.length > 0) {
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                const last = updated[lastIdx];
                updated[lastIdx] = {
                  ...last,
                  noImpact: false,
                  offTopic: false,
                  suggestion: { revisedSublemmas: revised, isHandled: false },
                };
                return updated;
              });
            } else {
              // Explicitly mark no impact when revised is an empty array
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                const last = updated[lastIdx];
                updated[lastIdx] = { ...last, noImpact: true, offTopic: false, suggestion: undefined };
                return updated;
              });
            }
          } catch {
            // If proposal payload is invalid JSON, ignore silently (no proposal)
          }
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
              className={`flex gap-3 text-sm items-end ${msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
            >
              {/* Assistant avatar removed per user request - name is shown above the message bubble */}
              <div
                className={`p-4 rounded-2xl max-w-xl break-words ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-white border border-muted-foreground/10 shadow-sm'
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
                        {(() => {
                          const revisedRaw = msg.suggestion!.revisedSublemmas;
                          const effective = mergeRevised(sublemmas, revisedRaw);
                          const changes = computeProofDiff(sublemmas, effective);
                          if (!changes.length) {
                            return (
                              <div className="text-xs text-muted-foreground">
                                No impact on the proof.
                              </div>
                            );
                          }
                          return changes.map((ch, i) => {
                            if (ch.kind === 'add') {
                              return (
                                <div key={i} className="rounded border border-muted-foreground/10 p-2">
                                  <div className="text-sm font-semibold">
                                    Add step at position {ch.at + 1}:{' '}
                                    <KatexRenderer
                                      content={ch.step.title || `Step ${ch.at + 1}`}
                                      className="inline"
                                      autoWrap={false}
                                    />
                                  </div>
                                  <div className="mt-1 text-sm space-y-2">
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-1">Statement</div>
                                      <KatexRenderer content={ch.step.statement} />
                                    </div>
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-1">Proof</div>
                                      <KatexRenderer content={ch.step.proof} />
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            if (ch.kind === 'remove') {
                              return (
                                <div key={i} className="rounded border border-muted-foreground/10 p-2">
                                  <div className="text-sm font-semibold">
                                    Remove step at position {ch.at + 1}:{' '}
                                    <KatexRenderer
                                      content={ch.step.title || `Step ${ch.at + 1}`}
                                      className="inline"
                                      autoWrap={false}
                                    />
                                  </div>
                                </div>
                              );
                            }
                            // modify
                            return (
                              <div key={i} className="rounded border border-muted-foreground/10 p-2">
                                <div className="text-sm font-semibold">
                                  Modify step at position {ch.at + 1}:{' '}
                                  <KatexRenderer
                                    content={ch.next.title || ch.old.title || `Step ${ch.at + 1}`}
                                    className="inline"
                                    autoWrap={false}
                                  />
                                </div>
                                <div className="mt-1 text-sm space-y-2">
                                  {ch.titleChanged && (
                                    <div className="text-xs">
                                      <span className="font-medium text-muted-foreground">Title</span>{' '}
                                      <span className="inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] align-middle ml-1">
                                        updated
                                      </span>
                                      <div className="mt-1">
                                        <KatexRenderer
                                          content={ch.old.title || `Step ${ch.at + 1}`}
                                          className="inline line-through opacity-70"
                                          autoWrap={false}
                                        />
                                        <span className="mx-2">→</span>
                                        <KatexRenderer
                                          content={ch.next.title || `Step ${ch.at + 1}`}
                                          className="inline font-medium"
                                          autoWrap={false}
                                        />
                                      </div>
                                    </div>
                                  )}
                                  {ch.statementChanged && (
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-1">
                                        Statement <span className="ml-1 inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">updated</span>
                                      </div>
                                      <KatexRenderer content={ch.next.statement} />
                                    </div>
                                  )}
                                  {ch.proofChanged && (
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-1">
                                        Proof <span className="ml-1 inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">updated</span>
                                      </div>
                                      <KatexRenderer content={ch.next.proof} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
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
                    <Button variant="secondary" size="sm" onClick={reset}>
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
                        {(() => {
                          const revisedRaw = msg.suggestion!.revisedSublemmas;
                          const effective = mergeRevised(sublemmas, revisedRaw);
                          const changes = computeProofDiff(sublemmas, effective);
                          if (!changes.length) {
                            return (
                              <div className="text-xs text-muted-foreground">
                                No impact on the proof.
                              </div>
                            );
                          }
                          return changes.map((ch, i) => {
                            if (ch.kind === 'add') {
                              return (
                                <div key={i} className="rounded border border-muted-foreground/10 p-2">
                                  <div className="text-sm font-semibold">
                                    Add step at position {ch.at + 1}:{' '}
                                    <KatexRenderer
                                      content={ch.step.title || `Step ${ch.at + 1}`}
                                      className="inline"
                                      autoWrap={false}
                                    />
                                  </div>
                                  <div className="mt-1 text-sm space-y-2">
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-1">Statement</div>
                                      <KatexRenderer content={ch.step.statement} />
                                    </div>
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-1">Proof</div>
                                      <KatexRenderer content={ch.step.proof} />
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            if (ch.kind === 'remove') {
                              return (
                                <div key={i} className="rounded border border-muted-foreground/10 p-2">
                                  <div className="text-sm font-semibold">
                                    Remove step at position {ch.at + 1}:{' '}
                                    <KatexRenderer
                                      content={ch.step.title || `Step ${ch.at + 1}`}
                                      className="inline"
                                      autoWrap={false}
                                    />
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div key={i} className="rounded border border-muted-foreground/10 p-2">
                                <div className="text-sm font-semibold">
                                  Modify step at position {ch.at + 1}:{' '}
                                  <KatexRenderer
                                    content={ch.next.title || ch.old.title || `Step ${ch.at + 1}`}
                                    className="inline"
                                    autoWrap={false}
                                  />
                                </div>
                                <div className="mt-1 text-sm space-y-2">
                                  {ch.titleChanged && (
                                    <div className="text-xs">
                                      <span className="font-medium text-muted-foreground">Title</span>{' '}
                                      <span className="inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] align-middle ml-1">
                                        updated
                                      </span>
                                      <div className="mt-1">
                                        <KatexRenderer
                                          content={ch.old.title || `Step ${ch.at + 1}`}
                                          className="inline line-through opacity-70"
                                          autoWrap={false}
                                        />
                                        <span className="mx-2">→</span>
                                        <KatexRenderer
                                          content={ch.next.title || `Step ${ch.at + 1}`}
                                          className="inline font-medium"
                                          autoWrap={false}
                                        />
                                      </div>
                                    </div>
                                  )}
                                  {ch.statementChanged && (
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-1">
                                        Statement <span className="ml-1 inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">updated</span>
                                      </div>
                                      <KatexRenderer content={ch.next.statement} />
                                    </div>
                                  )}
                                  {ch.proofChanged && (
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-1">
                                        Proof <span className="ml-1 inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">updated</span>
                                      </div>
                                      <KatexRenderer content={ch.next.proof} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
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
