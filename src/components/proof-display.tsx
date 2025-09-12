'use client';
import { useState, useTransition } from 'react';
import { Info, CheckCircle } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from './sublemma-item';
import { InteractiveChat } from './interactive-chat';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { KatexRenderer } from './katex-renderer';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface ProofDisplayProps {
  initialProblem: string;
  initialSublemmas: string[];
}

export default function ProofDisplay({ initialProblem, initialSublemmas }: ProofDisplayProps) {
  const [sublemmas, setSublemmas] = useState(initialSublemmas);
  const [validationResult, setValidationResult] = useState<{ isValid: boolean, feedback: string } | null>(null);

  return (
    <main className="flex-1 flex flex-col overflow-hidden border-l">
      <div className="flex-1 overflow-y-auto" style={{ WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 48px), transparent 100%)', maskImage: 'linear-gradient(to bottom, black calc(100% - 48px), transparent 100%)' }}>
        <div className="p-8">
          <div className="max-w-4xl mx-auto space-y-4">
            <Card className='mb-6'>
              <CardHeader>
                <CardTitle className='font-headline'>Original Problem</CardTitle>
              </CardHeader>
              <CardContent>
                <KatexRenderer content={initialProblem} />
              </CardContent>
            </Card>

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
      
      <InteractiveChat proofSteps={sublemmas} />
    </main>
  );
}
