'use client';
import { useState } from 'react';
import { Info, CheckCircle, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from './sublemma-item';
import { InteractiveChat, type Message } from './interactive-chat';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { KatexRenderer } from './katex-renderer';
import { Card, CardContent } from './ui/card';
import Link from 'next/link';
import { Button } from './ui/button';
import { Logo } from './logo';

interface ProofDisplayProps {
  initialProblem: string;
  initialSublemmas: string[];
}

const createInitialMessages = (problem?: string, sublemmas?: string[]): Message[] => {
    if (!problem || !sublemmas) {
        return [];
    }
    const assistantMessage = `Of course. I've broken down the problem into the following steps:\n\n${sublemmas.map((s, i) => `**Step ${i + 1}:** ${s}`).join('\n\n')}`;
    return [
        { role: 'user', content: problem },
        { role: 'assistant', content: assistantMessage },
    ];
}

export default function ProofDisplay({ initialProblem, initialSublemmas }: ProofDisplayProps) {
  const [sublemmas, setSublemmas] = useState(initialSublemmas);
  const [validationResult, setValidationResult] = useState<{ isValid: boolean, feedback: string } | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>(() => createInitialMessages(initialProblem, initialSublemmas));


  return (
    <div className="flex h-screen bg-background">
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
                <h2 className="text-2xl font-bold font-headline">Original Problem</h2>
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
              <div className="space-y-4">
                {validationResult && (
                  <Alert variant={validationResult.isValid ? "default" : "destructive"} className="mb-4 bg-card">
                    {validationResult.isValid ? <CheckCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                    <AlertTitle>{validationResult.isValid ? "Step Verified" : "Suggestion"}</AlertTitle>
                    <AlertDescription>{validationResult.feedback}</AlertDescription>
                  </Alert>
                )}

                <Accordion type="multiple" defaultValue={sublemmas.map((_, i) => `item-${i + 1}`)} className="w-full space-y-4 border-b-0">
                  {sublemmas.map((sublemma, index) => (
                    <SublemmaItem
                      key={index}
                      step={index + 1}
                      title={`Step ${index + 1}`}
                      content={sublemma}
                      isLast={index === sublemmas.length - 1}
                    />
                  ))}
                </Accordion>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {isChatOpen && (
        <aside className="w-[30rem] border-l flex flex-col h-screen">
          <InteractiveChat 
            proofSteps={sublemmas} 
            messages={messages}
            setMessages={setMessages}
          />
        </aside>
      )}
    </div>
  );
}
