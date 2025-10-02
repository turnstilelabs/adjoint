'use client';
import { useState, useEffect, useTransition, useRef } from 'react';
import { Info, CheckCircle, PanelRightClose, PanelRightOpen, Loader2, ShieldCheck, History, GitMerge, XCircle, FileDown } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from './sublemma-item';
import { InteractiveChat, type Message } from './interactive-chat';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { KatexRenderer } from './katex-renderer';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { generateProofGraphAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { ProofHistorySidebar } from './proof-history-sidebar';
import { isEqual } from 'lodash';
import { PageHeader } from './page-header';
import { LogoSmall } from './logo-small';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { validateStatementAction } from '@/app/actions';
import { ProofGraph, type GraphData } from './proof-graph';

interface ProofDisplayProps {
  initialProblem: string;
  sublemmas: Sublemma[];
  isLoading: boolean;
  messages: Message[];
  setMessages: (messages: Message[]) => void;
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

export default function ProofDisplay({
  initialProblem,
  sublemmas: initialSublemmas,
  isLoading,
  messages,
  setMessages,
}: ProofDisplayProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [sublemmas, setSublemmas] = useState<Sublemma[]>(initialSublemmas);
  const [isProofValidating, startProofValidationTransition] = useTransition();
  const [proofValidationResult, setProofValidationResult] = useState<ValidationResult | null>(null);
  const [lastValidatedSublemmas, setLastValidatedSublemmas] = useState<Sublemma[] | null>(null);
  const [isProofEdited, setIsProofEdited] = useState(true); // Start as true to allow initial validation
  const { toast } = useToast();
  const [proofHistory, setProofHistory] = useState<ProofVersion[]>([]);
  const [activeVersionIndex, setActiveVersionIndex] = useState(0);

  const [viewMode, setViewMode] = useState<'steps' | 'graph'>('steps');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isGraphLoading, startGraphLoadingTransition] = useTransition();
  const abortControllerRef = useRef<AbortController | null>(null);
  // Abort in-flight validation if component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const router = useRouter();
  const [isEditingProblem, setIsEditingProblem] = useState(false);
  const [editingProblemText, setEditingProblemText] = useState(initialProblem);
  const [editError, setEditError] = useState<string | null>(null);
  const [isValidatingProblem, startProblemValidationTransition] = useTransition();
  useEffect(() => {
    setEditingProblemText(initialProblem);
    setEditError(null);
  }, [initialProblem]);

  const generateGraph = (steps: Sublemma[]) => {
    startGraphLoadingTransition(async () => {
      const result = await generateProofGraphAction(steps);
      if ('nodes' in result && 'edges' in result) {
        setGraphData({
          nodes: result.nodes.map(n => {
            const m = n.id.match(/step-(\d+)/);
            const idx = m ? parseInt(m[1], 10) - 1 : -1;
            const content = idx >= 0 && idx < steps.length ? steps[idx].content : '';
            return { ...n, content };
          }),
          edges: result.edges
        });
      } else {
        setGraphData(null);
        toast({
          title: 'Graph Generation Failed',
          description: 'error' in result ? result.error : 'Unknown error.',
          variant: 'destructive',
        });
      }
    });
  };

  useEffect(() => {
    setSublemmas(initialSublemmas);
    if (initialSublemmas.length > 0) {
      const initialHistory = [{ sublemmas: initialSublemmas, timestamp: new Date() }];
      setProofHistory(initialHistory);
      setActiveVersionIndex(0);
      setLastValidatedSublemmas(null);
      setIsProofEdited(true);
      setGraphData(null); // Clear previous graph data
      generateGraph(initialSublemmas);
    }
  }, [initialSublemmas]);

  const updateProof = (newSublemmas: Sublemma[], changeDescription: string, opts?: { recomputeGraph?: boolean; changedIndex?: number; change?: 'title' | 'content' }) => {
    const newHistory = proofHistory.slice(0, activeVersionIndex + 1);
    const newVersion = { sublemmas: newSublemmas, timestamp: new Date() };

    setProofHistory([...newHistory, newVersion]);
    setSublemmas(newSublemmas);
    setActiveVersionIndex(newHistory.length);
    setIsProofEdited(true);

    if (opts?.recomputeGraph === false) {
      // Update graph locally without recomputing
      if (opts?.change === 'title' && typeof opts.changedIndex === 'number') {
        const changedIndex = opts.changedIndex;
        setGraphData(prev => {
          if (!prev) return prev;
          const nodeId = `step-${changedIndex + 1}`;
          const updatedNodes = prev.nodes.map(n =>
            n.id === nodeId ? { ...n, label: newSublemmas[changedIndex].title } : n
          );
          return { ...prev, nodes: updatedNodes };
        });
      } else if (opts?.change === 'content' && typeof opts.changedIndex === 'number') {
        const changedIndex = opts.changedIndex;
        setGraphData(prev => {
          if (!prev) return prev;
          const nodeId = `step-${changedIndex + 1}`;
          const updatedNodes = prev.nodes.map(n =>
            n.id === nodeId ? { ...n, content: newSublemmas[changedIndex].content } : n
          );
          return { ...prev, nodes: updatedNodes };
        });
      }
      // For other edits, leave graph structure as-is
    } else {
      setGraphData(null); // Invalidate old graph data
      generateGraph(newSublemmas);
    }
  };

  const handleSublemmaChange = (index: number, newContent: string) => {
    const newSublemmas = [...sublemmas];
    newSublemmas[index] = { ...newSublemmas[index], content: newContent };
    updateProof(newSublemmas, `Step ${index + 1} was manually edited.`, { recomputeGraph: false, changedIndex: index, change: 'content' });
  };

  const handleSublemmaTitleChange = (index: number, newTitle: string) => {
    const newSublemmas = [...sublemmas];
    newSublemmas[index] = { ...newSublemmas[index], title: newTitle };
    updateProof(newSublemmas, `Step ${index + 1} title renamed.`, { recomputeGraph: false, changedIndex: index, change: 'title' });
  };

  const handleProofRevisionFromChat = (newSublemmas: Sublemma[]) => {
    updateProof(newSublemmas, 'Proof revised by AI assistant.');
  }

  const handleValidateProof = () => {
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
          body: JSON.stringify({ problem: initialProblem, proofSteps: sublemmas }),
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

          setProofHistory(prev => {
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

  const handleRestoreVersion = (index: number) => {
    const versionToRestore = proofHistory[index];
    if (versionToRestore) {
      setSublemmas(versionToRestore.sublemmas);
      setActiveVersionIndex(index);
      setIsProofEdited(true);
      setProofValidationResult(null);
      toast({
        title: 'Proof Restored',
        description: `Restored version from ${versionToRestore.timestamp.toLocaleTimeString()}`,
      });

      setGraphData(null);
      generateGraph(versionToRestore.sublemmas);
    }
  };

  const toggleChat = () => {
    setIsChatOpen(prev => {
      const isOpening = !prev;
      if (isOpening) {
        setIsHistoryOpen(false);
      }
      return isOpening;
    });
  };

  const toggleHistory = () => {
    setIsHistoryOpen(prev => {
      const isOpening = !prev;
      if (isOpening) {
        setIsChatOpen(false);
      }
      return isOpening;
    });
  };

  const handleToggleView = () => {
    const newMode = viewMode === 'steps' ? 'graph' : 'steps';
    setViewMode(newMode);
    if (newMode === 'graph' && !graphData && !isGraphLoading) {
      generateGraph(sublemmas);
    }
  };

  const escapeLatexText = (s: string) => {
    return s
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/\^/g, '\\textasciicircum{}')
      .replace(/~/g, '\\textasciitilde{}');
  };

  const buildLatexDocument = (problem: string, steps: Sublemma[]) => {
    const lines: string[] = [];
    lines.push('\\documentclass[11pt]{article}');
    lines.push('\\usepackage[utf8]{inputenc}');
    lines.push('\\usepackage[T1]{fontenc}');
    lines.push('\\usepackage{lmodern}');
    lines.push('\\usepackage{geometry}');
    lines.push('\\geometry{margin=1in}');
    lines.push('\\usepackage{microtype}');
    lines.push('\\usepackage{amsmath,amssymb,amsthm,mathtools}');
    lines.push('\\usepackage{enumitem}');
    lines.push('\\usepackage{xcolor}');
    lines.push('\\usepackage{hyperref}');
    lines.push('\\hypersetup{hidelinks}');
    lines.push('');
    lines.push('% theorem environments');
    lines.push('\\newtheorem{theorem}{Theorem}');
    lines.push('\\newtheorem{lemma}{Lemma}');
    lines.push('\\newtheorem{proposition}{Proposition}');
    lines.push('\\newtheorem{corollary}{Corollary}');
    lines.push('\\theoremstyle{definition}');
    lines.push('\\newtheorem{definition}{Definition}');
    lines.push('\\theoremstyle{remark}');
    lines.push('\\newtheorem{remark}{Remark}');
    lines.push('');
    lines.push('\\title{Tentative Proof Export}');
    lines.push('\\author{Adjoint}');
    lines.push('\\date{\\today}');
    lines.push('');
    lines.push('\\begin{document}');
    lines.push('\\maketitle');
    lines.push('');
    lines.push('\\section*{Problem}');
    lines.push('\\begin{quote}');
    lines.push(problem);
    lines.push('\\end{quote}');
    lines.push('');
    lines.push('\\section*{Proof Outline}');
    lines.push('\\begin{enumerate}[leftmargin=*, label=Step~\\arabic*:]');
    steps.forEach((s, i) => {
      const t = escapeLatexText(s.title || `Step ${i + 1}`);
      const titleWithPunct = /[.?!:]$/.test(t) ? t : `${t}.`;
      lines.push(`\\item \\textbf{${titleWithPunct}} ${s.content}`);
    });
    lines.push('\\end{enumerate}');
    lines.push('');
    lines.push('\\end{document}');
    return lines.join('\n');
  };

  const handleExportTex = () => {
    try {
      const latex = buildLatexDocument(editingProblemText || initialProblem, sublemmas);
      const blob = new Blob([latex], { type: 'application/x-tex' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'proof.tex';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: 'Exported',
        description: 'LaTeX file downloaded as proof.tex',
      });
    } catch (e: any) {
      toast({
        title: 'Export Failed',
        description: e?.message || 'Could not export LaTeX.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-14 flex flex-col items-center py-4 border-r bg-card">
        <Link href="/" className="mb-6">
          <LogoSmall />
        </Link>
        <div className="flex flex-col items-center space-y-2">
          <Button
            variant="ghost"
            size="icon"
            title="History"
            onClick={() => {
              setIsHistoryOpen(prev => {
                const opening = !prev;
                if (opening) {
                  setIsChatOpen(false);
                }
                return opening;
              });
            }}
          >
            <History />
            <span className="sr-only">History</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            title="Graph"
            onClick={() => {
              const newMode = viewMode === 'graph' ? 'steps' : 'graph';
              setViewMode(newMode);
              if (newMode === 'graph' && !graphData && !isGraphLoading) {
                generateGraph(sublemmas);
              }
            }}
          >
            <GitMerge />
            <span className="sr-only">Graph</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            title="Chat"
            onClick={() => {
              toggleChat();
            }}
          >
            {isChatOpen ? <PanelRightClose /> : <PanelRightOpen />}
            <span className="sr-only">Chat</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Export .tex"
            onClick={handleExportTex}
            disabled={sublemmas.length === 0}
          >
            <FileDown />
            <span className="sr-only">Export .tex</span>
          </Button>
        </div>
        <div className="flex-1" />
      </aside>
      {isHistoryOpen && (
        <aside className="w-80 border-r flex flex-col h-screen bg-card">
          {isHistoryOpen ? (
            <ProofHistorySidebar
              history={proofHistory}
              activeIndex={activeVersionIndex}
              onRestore={handleRestoreVersion}
              onClose={() => setIsHistoryOpen(false)}
            />
          ) : (
            <div className="p-4 overflow-auto">
              {isGraphLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
              ) : graphData ? (
                <ProofGraph graphData={graphData} />
              ) : (
                <div className="text-muted-foreground">No graph available.</div>
              )}
            </div>
          )}
        </aside>
      )}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            {isLoading && (
              <div className="mb-4">
                <PageHeader />
              </div>
            )}
            <Card className="mb-1">
              <CardContent className='pt-6'>
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
                              const params = new URLSearchParams();
                              params.append('problem', trimmed);
                              router.push(`/proof?${params.toString()}`);
                            } else if ('validity' in result) {
                              setEditError("Looks like that’s not math! This app only works with math problems.");
                            } else {
                              const errorMessage = result.error || "An unexpected error occurred while validating the problem.";
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
                      <div className="text-sm text-muted-foreground mt-2">Press Enter to submit, Shift+Enter for newline, Esc to cancel.</div>
                    )}
                    {editError && (
                      <Alert variant="destructive" className="mt-4">
                        <AlertDescription>{editError}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : (
                  <div onDoubleClick={() => { setIsEditingProblem(true); setEditingProblemText(initialProblem); }} style={{ cursor: 'pointer' }}>
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
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-lg font-medium">Generating proof steps...</p>
                    <p className="text-sm">The AI is thinking. This may take a moment.</p>
                  </div>
                </div>
              ) : viewMode === 'steps' ? (
                <div className="space-y-4">
                  <Accordion type="multiple" defaultValue={sublemmas.map((_, i) => `item-${i + 1}`)} className="w-full space-y-4 border-b-0">
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
                isGraphLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-4 text-muted-foreground">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-lg font-medium">Generating dependency graph...</p>
                    </div>
                  </div>
                ) : graphData ? (
                  <ProofGraph graphData={graphData} />
                ) : (
                  <div className="text-center py-16 text-muted-foreground">
                    <p>Could not generate graph.</p>
                  </div>
                )
              )}

              <div className="pt-4 space-y-4">
                {proofValidationResult && (
                  <Alert variant={proofValidationResult.isValid ? "default" : "destructive"} className="bg-card">
                    {proofValidationResult.isValid ? <CheckCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                    <AlertTitle>{proofValidationResult.isValid ? "Proof Verified" : "Proof Invalid"}</AlertTitle>
                    <AlertDescription>
                      <KatexRenderer content={proofValidationResult.feedback} />
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <div className="sticky bottom-0 left-0 right-0 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-4xl mx-auto p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center text-sm text-muted-foreground">
                    {isProofValidating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                        Validating full proof...
                      </>
                    ) : isProofEdited ? (
                      <>Changes not validated yet.</>
                    ) : (
                      <>Up to date.</>
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
                      disabled={isProofValidating || sublemmas.length === 0 || (!isProofEdited && lastValidatedSublemmas !== null)}
                    >
                      {isProofValidating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Validating...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Validate Full Proof
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
          <InteractiveChat
            problem={initialProblem}
            sublemmas={sublemmas}
            onProofRevision={handleProofRevisionFromChat}
            messages={messages}
            setMessages={setMessages}
          />
        </aside>
      )}
    </div>
  );
}
