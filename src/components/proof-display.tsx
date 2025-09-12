'use client';
import { useState } from 'react';
import { Info, CheckCircle } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from './sublemma-item';
import { InteractiveChat } from './interactive-chat';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { KatexRenderer } from './katex-renderer';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { SidebarTrigger } from './ui/sidebar';

interface ProofDisplayProps {
  initialProblem: string;
  initialSublemmas: string[];
}

export default function ProofDisplay({ initialProblem, initialSublemmas }: ProofDisplayProps) {
  const [sublemmas, setSublemmas] = useState(initialSublemmas);
  const [validationResult, setValidationResult] = useState<{ isValid: boolean, feedback: string } | null>(null);

  return (
    <main className="flex-1 flex flex-col overflow-hidden h-screen">
      {/* Non-scrollable header */}
      <div className="p-6 border-b flex-shrink-0">
        <div className="max-w-4xl mx-auto">
            <div className='flex items-center gap-4 mb-4'>
              <SidebarTrigger />
              <h2 className="text-2xl font-bold font-headline">Original Problem</h2>
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
      
      <InteractiveChat proofSteps={sublemmas} />
    </main>
  );
}
