'use client';
import { useState, useEffect, useTransition } from 'react';
import { Info, CheckCircle, PanelRightClose, PanelRightOpen, Loader2, ShieldCheck, History } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from './sublemma-item';
import { InteractiveChat, type Message } from './interactive-chat';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { KatexRenderer } from './katex-renderer';
import { Card, CardContent } from './ui/card';
import Link from 'next/link';
import { Button } from './ui/button';
import { Logo } from './logo';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { validateProofAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { ProofHistorySidebar } from './proof-history-sidebar';

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
};

export default function ProofDisplay({
  initialProblem,
  sublemmas: initialSublemmas,
  isLoading,
  messages,
  setMessages,
}: ProofDisplayProps) {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [sublemmas, setSublemmas] = useState<Sublemma[]>(initialSublemmas);
  const [isProofValidating, startProofValidationTransition] = useTransition();
  const [proofValidationResult, setProofValidationResult] = useState<ValidationResult | null>(null);
  const [lastValidatedSublemmas, setLastValidatedSublemmas] = useState<Sublemma[] | null>(null);
  const [isProofEdited, setIsProofEdited] = useState(false);
  const { toast } = useToast();
  const [proofHistory, setProofHistory] = useState<ProofVersion[]>([]);

  useEffect(() => {
    setSublemmas(initialSublemmas);
    if (initialSublemmas.length > 0) {
      // Save initial AI-generated proof as the first version
      setProofHistory([{ sublemmas: initialSublemmas, timestamp: new Date() }]);
    }
  }, [initialSublemmas]);

  const handleSublemmaChange = (index: number, newContent: string) => {
    const newSublemmas = [...sublemmas];
    // This was the source of the bug. It was creating a new object without preserving the title.
    // The fix is to spread the existing sublemma object to retain its properties like `title`.
    newSublemmas[index] = { ...newSublemmas[index], content: newContent };
    setSublemmas(newSublemmas);
    setIsProofEdited(true);
  
    // This logic should be moved to the save handler in SublemmaItem if we want to avoid saving on every keystroke.
    // For now, let's assume saving on content change is the desired behavior for history.
    setProofHistory(prevHistory => [...prevHistory, { sublemmas: newSublemmas, timestamp: new Date() }]);
  };

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
      } else {
        toast({
          title: 'Validation Failed',
          description: result.error || 'An unexpected error occurred during validation.',
          variant: 'destructive',
        });
      }
    });
  };

  const handleRestoreVersion = (version: ProofVersion) => {
    setSublemmas(version.sublemmas);
    // Add the restored state as the newest item in history
    setProofHistory(prev => [...prev, { sulemmas: version.sublemmas, timestamp: new Date() }]);
    setIsProofEdited(true); // Mark as edited so it can be re-validated
    setProofValidationResult(null); // Clear old validation result
    toast({
      title: 'Proof Restored',
      description: `Restored version from ${version.timestamp.toLocaleTimeString()}`,
    });
  };
  
  return (
    <div className="flex h-screen bg-background">
      {isHistoryOpen && (
        <aside className="w-80 border-r flex flex-col h-screen bg-card">
          <ProofHistorySidebar 
            history={proofHistory}
            onRestore={handleRestoreVersion}
            onClose={() => setIsHistoryOpen(false)}
          />
        </aside>
      )}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Non-scrollable header */}
        <div className="p-6 border-b flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className='flex items-center gap-4'>
                <Button asChild variant="ghost" size="icon">
                  <Link href="/">
                    <Logo />
                    <span className="sr-only">New Proof</span>
                  </Link>
                </Button>
                <div className='flex items-center gap-2'>
                  <Button variant="outline" size="icon" onClick={() => setIsHistoryOpen(!isHistoryOpen)}>
                    <History />
                    <span className="sr-only">Toggle History</span>
                  </Button>
                  <h2 className="text-2xl font-bold font-headline">Original Problem</h2>
                </div>
              </div>
              <Button variant="outline" size="icon" onClick={() => setIsChatOpen(!isChatOpen)}>
                {isChatOpen ? <PanelRightClose /> : <PanelRightOpen />}
                <span className="sr-only">Toggle Chat</span>
              </Button>
            </div>
            <Card>
              <CardContent className='pt-6'>
                <KatexRenderer content={initialProblem} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold font-headline mb-4">Tentative Proof</h2>
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-lg font-medium">Generating proof steps...</p>
                    <p className="text-sm">The AI is thinking. This may take a moment.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Accordion type="multiple" defaultValue={sublemmas.map((_, i) => `item-${i + 1}`)} className="w-full space-y-4 border-b-0">
                    {sublemmas.map((sublemma, index) => (
                      <SublemmaItem
                        key={index}
                        step={index + 1}
                        title={sublemma.title}
                        content={sublemma.content}
                        onContentChange={(newContent) => handleSublemmaChange(index, newContent)}
                      />
                    ))}
                  </Accordion>
                  
                  <div className="pt-4 space-y-4">
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleValidateProof}
                      disabled={isProofValidating || sublemmas.length === 0 || !isProofEdited}
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
              )}
            </div>
          </div>
        </div>
      </main>
      
      {isChatOpen && (
        <aside className="w-[30rem] border-l flex flex-col h-screen">
          <InteractiveChat 
            proofSteps={sublemmas.map(s => `${s.title}: ${s.content}`)} 
            messages={messages}
            setMessages={setMessages}
          />
        </aside>
      )}
    </div>
  );
}
