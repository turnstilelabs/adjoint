'use client';
import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { KatexRenderer } from './katex-renderer';
import { Wand2, BrainCircuit, Play, Loader2, X, Sigma } from 'lucide-react';
import { autoformalizeAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

interface VerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: number;
  lemma: string;
  onProofComplete: (proof: string) => void;
}

export function VerifyModal({
  isOpen,
  onClose,
  step,
  lemma,
  onProofComplete,
}: VerifyModalProps) {
  const [formalization, setFormalization] = useState('');
  const [isAutoformalizing, startAutoformalizeTransition] = useTransition();
  const [isProving, startProvingTransition] = useTransition();
  const { toast } = useToast();

  const handleAutoformalize = () => {
    startAutoformalizeTransition(async () => {
      setFormalization(''); // Clear previous formalization
      const result = await autoformalizeAction(lemma);
      if (result.success && result.formalization) {
        setFormalization(result.formalization);
      } else {
        toast({
          title: 'Autoformalization Failed',
          description:
            result.error || 'An unexpected error occurred.',
          variant: 'destructive',
        });
      }
    });
  };

  const handleAttemptProof = () => {
    startProvingTransition(async () => {
        // In a real scenario, this would call another action with the formalization
        // and get a proof back. For now, we'll simulate it.
        const result = await autoformalizeAction(lemma); // Re-using for demonstration
        if (result.success && result.proof) {
            onProofComplete(result.proof);
        } else {
            toast({
                title: 'Proof Attempt Failed',
                description: result.error || 'Could not generate a proof.',
                variant: 'destructive',
            });
        }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-full p-0">
        <DialogHeader className="p-8 pb-0">
          <div className="flex justify-between items-start">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                <Sigma className="h-4 w-4" />
                Step {step}
              </span>
              <DialogTitle className="text-2xl font-bold text-gray-900 mt-3">
                Verify Lemma
              </DialogTitle>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <X className="h-5 w-5" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="px-8 space-y-8 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-sm font-medium text-gray-700">
              Lemma Statement
            </label>
            <div className="mt-2 p-6 bg-gray-50 border border-gray-200 rounded-lg">
              <KatexRenderer content={lemma} className="text-gray-800 text-lg" />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">
                Formalization (Lean 4)
              </label>
              <Button
                variant="link"
                className="text-primary hover:text-primary/80"
                onClick={handleAutoformalize}
                disabled={isAutoformalizing}
              >
                {isAutoformalizing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Autoformalize
              </Button>
            </div>
            <div className="mt-2">
              <Textarea
                value={formalization}
                onChange={(e) => setFormalization(e.target.value)}
                className="w-full h-48 bg-gray-900 text-gray-200 border-gray-700 rounded-lg p-4 font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-y"
                spellCheck="false"
                placeholder="-- Autoformalized Lean code will appear here."
                disabled={isAutoformalizing}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="p-8 border-t border-gray-200 flex-col-reverse sm:flex-row sm:justify-end sm:space-x-4">
           <div className="flex-1">
            <label htmlFor="prover-model" className="sr-only">AI Prover Model</label>
            <div className="relative">
              <BrainCircuit className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Select defaultValue="gemini-2.5-flash">
                <SelectTrigger className="w-full pl-10">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (Default)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="claude-3.5">Claude 3.5 Sonnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="lg"
            onClick={handleAttemptProof}
            disabled={!formalization || isProving}
          >
            {isProving ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Play className="mr-2 h-5 w-5" />
            )}
            Attempt Proof
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
