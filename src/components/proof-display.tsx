'use client';
import { useState, useTransition } from 'react';
import { PlusCircle, Info, CheckCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from './sublemma-item';
import { InteractiveChat } from './interactive-chat';
import { addProofStepAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { KatexRenderer } from './katex-renderer';

interface ProofDisplayProps {
  initialProblem: string;
  initialSublemmas: string[];
}

export default function ProofDisplay({ initialProblem, initialSublemmas }: ProofDisplayProps) {
  const [sublemmas, setSublemmas] = useState(initialSublemmas);
  const [newStep, setNewStep] = useState('');
  const [validationResult, setValidationResult] = useState<{ isValid: boolean, feedback: string } | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const { toast } = useToast();

  const handleAddStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStep.trim()) return;
    setValidationResult(null);

    startTransition(async () => {
      const currentSteps = sublemmas.join('\n');
      const result = await addProofStepAction(initialProblem, currentSteps, newStep);
      
      if (result.success && typeof result.isValid === 'boolean' && result.feedback) {
        setValidationResult({ isValid: result.isValid, feedback: result.feedback });
        if (result.isValid) {
          setSublemmas(prev => [...prev, newStep]);
          setNewStep('');
        }
      } else {
        toast({
          title: 'Validation Error',
          description: result.error || "Could not validate the new step.",
          variant: 'destructive',
        });
      }
    });
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden border-l">
      <div className="px-8 py-4 bg-card border-b">
        <form onSubmit={handleAddStep} className="relative">
          <PlusCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            type="text"
            placeholder="Enter LaTeX or English to add a new proof step... e.g., 'Let x > 0'"
            className="w-full bg-gray-100 border-gray-300 rounded-lg pl-10 pr-4 py-3 text-base h-12 focus-visible:ring-primary"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            disabled={isSubmitting}
          />
          {isSubmitting && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin" />}
        </form>
      </div>

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
