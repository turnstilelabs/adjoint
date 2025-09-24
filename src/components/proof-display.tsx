'use client';
import { useState, useEffect, useTransition } from 'react';
import { Info, CheckCircle, PanelRightClose, PanelRightOpen, Loader2, ShieldCheck, History, GitMerge } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from './sublemma-item';
import { InteractiveChat, type Message } from './interactive-chat';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { KatexRenderer } from './katex-renderer';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { validateProofAction, generateProofGraphAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { ProofHistorySidebar } from './proof-history-sidebar';
import { isEqual } from 'lodash';
import { PageHeader } from './page-header';
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
  const [sublemmas, setSublemmas] = useState<Sublemma[]>(initialSublemmas);
  const [isProofValidating, startProofValidationTransition] = useTransition();
  const [proofValidationResult, setProofValidationResult] = useState<ValidationResult | null>(null);
  const [lastValidatedSublemmas, setLastValidatedSublemmas] = useState<Sublemma[] | null>(null);
  const [isProofEdited, setIsProofEdited] = useState(false);
  const { toast } = useToast();
  const [proofHistory, setProofHistory] = useState<ProofVersion[]>([]);
  const [activeVersionIndex, setActiveVersionIndex] = useState(0);

  const [viewMode, setViewMode] = useState<'steps' | 'graph'>('steps');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isGraphLoading, startGraphLoadingTransition] = useTransition();

  useEffect(() => {
    setSublemmas(initialSublemmas);
    if (initialSublemmas.length > 0) {
      const initialHistory = [{ sublemmas: initialSublemmas, timestamp: new Date() }];
      setProofHistory(initialHistory);
      setActiveVersionIndex(0);

      // Automatically generate graph data for the initial proof
      startGraphLoadingTransition(async () => {
        const result = await generateProofGraphAction(initialSublemmas);
        if (result.success) {
          setGraphData({ nodes: result.nodes!, edges: result.edges! });
        } else {
          toast({
            title: 'Graph Generation Failed',
            description: result.error,
            variant: 'destructive',
          });
        }
      });
    }
  }, [initialSublemmas, toast]);

  const updateProof = (newSublemmas: Sublemma[], changeDescription: string) => {
    const newHistory = proofHistory.slice(0, activeVersionIndex + 1);
    const newVersion = { sublemmas: newSublemmas, timestamp: new Date() };
    
    setProofHistory([...newHistory, newVersion]);
    setSublemmas(newSublemmas);
    setActiveVersionIndex(newHistory.length);
    setIsProofEdited(true);
    setGraphData(null); // Invalidate old graph data

    toast({
        title: "Proof Updated",
        description: changeDescription,
    });
    
    startGraphLoadingTransition(async () => {
      const result = await generateProofGraphAction(newSublemmas);
      if (result.success) {
        setGraphData({ nodes: result.nodes!, edges: result.edges! });
      } else {
        toast({
          title: 'Graph Generation Failed',
          description: result.error,
          variant: 'destructive',
        });
      }
    });
  };

  const handleSublemmaChange = (index: number, newContent: string) => {
    const newSublemmas = [...sublemmas];
    newSublemmas[index] = { ...newSublemmas[index], content: newContent };
    updateProof(newSublemmas, `Step ${index + 1} was manually edited.`);
  };

  const handleProofRevisionFromChat = (newSublemmas: Sublemma[]) => {
    updateProof(newSublemmas, 'Proof revised by AI assistant.');
  }

  const handleValidateProof = () => {
    startProofValidationTransition(async () => {
      setProofValidationResult(null);
      const result = await validateProofAction(initialProblem, sublemmas);
      if (result.success) {
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
          description: result.error || 'An unexpected error occurred during validation.',
          variant: 'destructive',
        });
      }
    });
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

        startGraphLoadingTransition(async () => {
            const result = await generateProofGraphAction(versionToRestore.sublemmas);
            if (result.success) {
                setGraphData({ nodes: result.nodes!, edges: result.edges! });
            } else {
                setGraphData(null);
            }
        });
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
  
  return (
    <div className="flex h-screen bg-background">
      {isHistoryOpen && (
        <aside className="w-80 border-r flex flex-col h-screen bg-card">
          <ProofHistorySidebar 
            history={proofHistory}
            activeIndex={activeVersionIndex}
            onRestore={handleRestoreVersion}
            onClose={() => setIsHistoryOpen(false)}
          />
        </aside>
      )}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="p-6 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
             <div className="flex items-center justify-between gap-4 mb-4">
               <PageHeader />
              <Button variant="outline" size="icon" onClick={toggleChat}>
                {isChatOpen ? <PanelRightClose /> : <PanelRightOpen />}
                <span className="sr-only">Toggle Chat</span>
              </Button>
            </div>
            <h2 className="text-2xl font-bold font-headline mb-4">Original Problem</h2>
            <Card>
              <CardContent className='pt-6'>
                <KatexRenderer content={initialProblem} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <Button variant="outline" size="icon" onClick={toggleHistory} title="Toggle History">
                  <History />
                  <span className="sr-only">Toggle History</span>
                </Button>
                 <Button
                    variant={viewMode === 'graph' ? 'secondary' : 'outline'}
                    size="icon"
                    onClick={() => setViewMode(viewMode === 'steps' ? 'graph' : 'steps')}
                    title="Toggle Graph View"
                    disabled={!graphData && !isGraphLoading}
                  >
                    <GitMerge />
                    <span className="sr-only">Toggle Graph View</span>
                  </Button>
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
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleValidateProof}
                      disabled={isProofValidating || sublemmas.length === 0 || !isProofEdited && lastValidatedSublemmas !== null}
                    >
                      {isProofValidating ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <ShieldCheck className="mr-2 h-5 w-5" />
                      )}
                      Validate Full Proof
                    </Button>
                     {proofValidationResult && (
                        <Alert variant={proofValidationResult.isValid ? "default" : "destructive"} className="mt-4 bg-card">
                          {proofValidationResult.isValid ? <CheckCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                          <AlertTitle>{proofValidationResult.isValid ? "Proof Verified" : "Proof Invalid"}</AlertTitle>
                          <AlertDescription>
                            <KatexRenderer content={proofValidationResult.feedback} />
                          </AlertDescription>
                        </Alert>
                      )}
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
