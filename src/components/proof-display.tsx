'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from './sublemma-item';
import { InteractiveChat } from './interactive-chat';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { KatexRenderer } from './katex-renderer';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { validateStatementAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { ProofSidebar } from './proof-sidebar';
import { isEqual } from 'lodash';
import { Textarea } from '@/components/ui/textarea';
import { ProofGraphView } from './proof-graph-view';
import { useAppStore } from '@/state/app-store';

interface ProofDisplayProps {
  initialProblem: string;
}

type ValidationResult = {
  isValid: boolean;
  feedback: string;
};

export type ProofVersion = {
  sublemmas: Sublemma[];
  timestamp: Date;
  isValid?: boolean;
};

export default function ProofDisplay({ initialProblem }: ProofDisplayProps) {
  const { toast } = useToast();
  const {
    isChatOpen,
    viewMode,
    sublemmas,
    proofHistory,
    activeVersionIndex,
    isProofEdited,
    lastReviewStatus,
    lastReviewedAt,
    proofValidationResult,
  } = useAppStore((s) => ({
    isChatOpen: s.isChatOpen,
    viewMode: s.viewMode,
    sublemmas: s.sublemmas,
    proofHistory: s.proofHistory,
    activeVersionIndex: s.activeVersionIndex,
    isProofEdited: s.isProofEdited,
    lastReviewStatus: s.lastReviewStatus,
    lastReviewedAt: s.lastReviewedAt,
    proofValidationResult: s.proofValidationResult,
  }));

  const setGraphData = useAppStore((s) => s.setGraphData);
  const setSublemmas = useAppStore((s) => s.setSublemmas);
  const setProofHistory = useAppStore((s) => s.setProofHistory);
  const setActiveVersionIndex = useAppStore((s) => s.setActiveVersionIndex);
  const setIsProofEdited = useAppStore((s) => s.setIsProofEdited);
  const setLastReviewStatus = useAppStore((s) => s.setLastReviewStatus);
  const setLastReviewedAt = useAppStore((s) => s.setLastReviewedAt);
  const setProofValidationResult = useAppStore((s) => s.setProofValidationResult);
  const setLastValidatedSublemmas = useAppStore((s) => s.setLastValidatedSublemmas);

  const [isProofValidating, startProofValidationTransition] = useTransition();

  const abortControllerRef = useRef<AbortController | null>(null);
  // Abort in-flight validation if component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const [isEditingProblem, setIsEditingProblem] = useState(false);
  const [editingProblemText, setEditingProblemText] = useState(initialProblem);
  const [editError, setEditError] = useState<string | null>(null);
  const [isValidatingProblem, startProblemValidationTransition] = useTransition();
  useEffect(() => {
    setEditingProblemText(initialProblem);
    setEditError(null);
  }, [initialProblem]);

  const updateProof = (
    newSublemmas: Sublemma[],
    changeDescription: string,
    opts?: {
      recomputeGraph?: boolean;
      changedIndex?: number;
      change?: 'title' | 'content';
    },
  ) => {
    const newHistory = proofHistory.slice(0, activeVersionIndex + 1);
    const newVersion = { sublemmas: newSublemmas, timestamp: new Date() };

    setProofHistory([...newHistory, newVersion]);
    setSublemmas(newSublemmas);
    setActiveVersionIndex(newHistory.length);
    setIsProofEdited(true);
    setLastReviewStatus('ready');
    setLastReviewedAt(null);

    if (opts?.recomputeGraph === false) {
      // Update graph locally without recomputing
      if (opts?.change === 'title' && typeof opts.changedIndex === 'number') {
        const changedIndex = opts.changedIndex;
        setGraphData((prev) => {
          if (!prev) return prev;
          const nodeId = `step-${changedIndex + 1}`;
          const updatedNodes = prev.nodes.map((n) =>
            n.id === nodeId ? { ...n, label: newSublemmas[changedIndex].title } : n,
          );
          return { ...prev, nodes: updatedNodes };
        });
      } else if (opts?.change === 'content' && typeof opts.changedIndex === 'number') {
        const changedIndex = opts.changedIndex;
        setGraphData((prev) => {
          if (!prev) return prev;
          const nodeId = `step-${changedIndex + 1}`;
          const updatedNodes = prev.nodes.map((n) =>
            n.id === nodeId ? { ...n, content: newSublemmas[changedIndex].content } : n,
          );
          return { ...prev, nodes: updatedNodes };
        });
      }
      // For other edits, leave graph structure as-is
    } else {
      setGraphData(null); // Invalidate old graph data; ProofGraphView will generate on demand if open
    }
  };

  const handleSublemmaChange = (index: number, newContent: string) => {
    const newSublemmas = [...sublemmas];
    newSublemmas[index] = { ...newSublemmas[index], content: newContent };
    updateProof(newSublemmas, `Step ${index + 1} was manually edited.`, {
      recomputeGraph: false,
      changedIndex: index,
      change: 'content',
    });
  };

  const handleSublemmaTitleChange = (index: number, newTitle: string) => {
    const newSublemmas = [...sublemmas];
    newSublemmas[index] = { ...newSublemmas[index], title: newTitle };
    updateProof(newSublemmas, `Step ${index + 1} title renamed.`, {
      recomputeGraph: false,
      changedIndex: index,
      change: 'title',
    });
  };

  const handleProofRevisionFromChat = (newSublemmas: Sublemma[]) => {
    updateProof(newSublemmas, 'Proof revised by AI assistant.');
  };

  const handleValidateProof = () => {
    // Prevent re-running when nothing changed since last review
    if (
      !isProofEdited &&
      (lastReviewStatus === 'reviewed_ok' || lastReviewStatus === 'reviewed_issues')
    ) {
      return;
    }
    // If already validating, clicking acts as Abort
    if (isProofValidating) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    startProofValidationTransition(async () => {
      setProofValidationResult(null);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const res = await fetch('/api/validate-proof', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            problem: initialProblem,
            proofSteps: sublemmas,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // If the client aborted, the fetch throws before reaching here in most browsers.
          // But handle non-2xx responses too.
          let message = 'Failed to validate the proof with AI.';
          try {
            const data = await res.json();
            if (data?.error) message = data.error;
          } catch {
            // ignore json parse error
          }
          throw new Error(message);
        }

        const result = await res.json();
        if ('isValid' in result && 'feedback' in result) {
          const validationResult = {
            isValid: result.isValid || false,
            feedback: result.feedback || 'No feedback provided.',
          };
          setProofValidationResult(validationResult);
          setLastValidatedSublemmas(sublemmas);
          setIsProofEdited(false);
          setLastReviewStatus(validationResult.isValid ? 'reviewed_ok' : 'reviewed_issues');
          setLastReviewedAt(new Date());

          setProofHistory((prev) => {
            const updatedHistory = [...prev];
            const activeVersion = updatedHistory[activeVersionIndex];
            if (activeVersion && isEqual(activeVersion.sublemmas, sublemmas)) {
              activeVersion.isValid = validationResult.isValid;
            }
            return updatedHistory;
          });
        } else {
          toast({
            title: 'Validation Failed',
            description: 'An unexpected error occurred during validation.',
            variant: 'destructive',
          });
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          // Swallow; user intentionally aborted
        } else {
          setLastReviewStatus('error');
          toast({
            title: 'Validation Failed',
            description: error?.message || 'An unexpected error occurred during validation.',
            variant: 'destructive',
          });
        }
      } finally {
        abortControllerRef.current = null;
      }
    });
  };

  const handleAbortValidation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="flex h-screen w-full">
      <ProofSidebar />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <Card className="mb-1">
              <CardContent className="pt-6">
                {isEditingProblem ? (
                  <div>
                    <Textarea
                      value={editingProblemText}
                      onChange={(e) => setEditingProblemText(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (isValidatingProblem) return;
                          startProblemValidationTransition(async () => {
                            setEditError(null);
                            const trimmed = editingProblemText.trim();
                            if (!trimmed) {
                              setEditError('Please enter a problem to solve.');
                              return;
                            }
                            const result = await validateStatementAction(trimmed);
                            if ('validity' in result && result.validity === 'VALID') {
                              setIsEditingProblem(false);
                              const startProof = useAppStore.getState().startProof;
                              await startProof(trimmed);
                            } else if ('validity' in result) {
                              setEditError(
                                'Looks like that’s not math! This app only works with math problems.',
                              );
                            } else {
                              const errorMessage =
                                result.error ||
                                'An unexpected error occurred while validating the problem.';
                              setEditError(errorMessage);
                              toast({
                                title: 'Validation Error',
                                description: errorMessage,
                                variant: 'destructive',
                              });
                            }
                          });
                        } else if (e.key === 'Escape') {
                          setIsEditingProblem(false);
                          setEditingProblemText(initialProblem);
                          setEditError(null);
                        }
                      }}
                      autoFocus
                      rows={3}
                      className="w-full"
                      disabled={isValidatingProblem}
                    />
                    {isValidatingProblem ? (
                      <div className="flex items-center text-sm text-muted-foreground mt-2">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                        Validating...
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground mt-2">
                        Press Enter to submit, Shift+Enter for newline, Esc to cancel.
                      </div>
                    )}
                    {editError && (
                      <Alert variant="destructive" className="mt-4">
                        <AlertDescription>{editError}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : (
                  <div
                    onDoubleClick={() => {
                      setIsEditingProblem(true);
                      setEditingProblemText(initialProblem);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <KatexRenderer content={initialProblem} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="max-w-4xl mx-auto">
              <div className="sticky top-0 z-20 flex items-center gap-2 mb-1 bg-background border-b">
                <h2 className="text-2xl font-bold font-headline">Tentative Proof</h2>
              </div>
              {viewMode === 'steps' ? (
                <div className="space-y-4">
                  <Accordion
                    type="multiple"
                    defaultValue={sublemmas.map((_, i) => `item-${i + 1}`)}
                    className="w-full space-y-4 border-b-0"
                  >
                    {sublemmas.map((sublemma, index) => (
                      <SublemmaItem
                        key={`${activeVersionIndex}-${index}`}
                        step={index + 1}
                        title={sublemma.title}
                        content={sublemma.content}
                        onContentChange={(newContent) => handleSublemmaChange(index, newContent)}
                        onTitleChange={(newTitle) => handleSublemmaTitleChange(index, newTitle)}
                      />
                    ))}
                  </Accordion>
                </div>
              ) : (
                <ProofGraphView />
              )}

              <div className="pt-4 space-y-4">
                {proofValidationResult && (
                  <Alert
                    variant={proofValidationResult.isValid ? 'default' : 'destructive'}
                    className="bg-card"
                  >
                    {proofValidationResult.isValid ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>
                      {proofValidationResult.isValid ? 'Reviewed by AI' : 'AI found issues'}
                    </AlertTitle>
                    <AlertDescription>
                      <KatexRenderer content={proofValidationResult.feedback} />
                      <div className="mt-2 text-xs text-muted-foreground">
                        {proofValidationResult.isValid
                          ? 'Assessed by AI'
                          : 'Flagged by AI; please double-check.'}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <div className="sticky bottom-0 left-0 right-0 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-4xl mx-auto p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center text-sm text-muted-foreground">
                    {lastReviewStatus === 'ready' && (
                      <>
                        <Info className="mr-2 h-4 w-4" />
                        <span>Ready for AI review</span>
                      </>
                    )}
                    {lastReviewStatus === 'reviewed_ok' && (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        <span>Reviewed by AI</span>
                        {lastReviewedAt && (
                          <span className="ml-2 text-xs">
                            • {lastReviewedAt.toLocaleTimeString()}
                          </span>
                        )}
                      </>
                    )}
                    {lastReviewStatus === 'reviewed_issues' && (
                      <>
                        <XCircle className="mr-2 h-4 w-4" />
                        <span>AI found issues</span>
                      </>
                    )}
                    {lastReviewStatus === 'error' && (
                      <>
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        <span>Couldn’t review</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isProofValidating && (
                      <Button variant="outline" size="sm" onClick={handleAbortValidation}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                    )}
                    <Button
                      onClick={handleValidateProof}
                      disabled={
                        isProofValidating ||
                        sublemmas.length === 0 ||
                        (!isProofEdited &&
                          (lastReviewStatus === 'reviewed_ok' ||
                            lastReviewStatus === 'reviewed_issues'))
                      }
                    >
                      {isProofValidating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Reviewing…
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Run AI review
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {isChatOpen && (
        <aside className="w-[30rem] border-l flex flex-col h-screen">
          <InteractiveChat onProofRevision={handleProofRevisionFromChat} />
        </aside>
      )}
    </div>
  );
}
