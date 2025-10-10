'use client';

import { useState, useTransition } from 'react';
import { Wand2, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from './ui/card';
import { validateStatementAction } from '@/app/actions';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from './ui/alert';
import { useAppStore } from '@/state/app-store';

export default function ProblemInputForm() {
  const [problem, setProblem] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const startProof = useAppStore((s) => s.startProof);

  const submitProblem = async (text: string) => {
    const trimmedProblem = text.trim();
    if (!trimmedProblem) {
      setError('Please enter a problem to solve.');
      return;
    }
    setError(null);
    const validationResult = await validateStatementAction(trimmedProblem);

    if ('validity' in validationResult && validationResult.validity === 'VALID') {
      await startProof(trimmedProblem);
    } else if ('validity' in validationResult) {
      // The statement was validated but not as a valid math problem
      setError('Looks like that’s not math! This app only works with math problems.');
    } else {
      const errorMessage =
        validationResult.error || 'An unexpected error occurred while validating the problem.';
      setError(errorMessage);
      toast({
        title: 'Validation Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      await submitProblem(problem);
    });
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setProblem(e.target.value);
    if (error) {
      setError(null);
    }
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
    <Card className="shadow-lg transition-shadow border-gray-200">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Textarea
              value={problem}
              onChange={handleTextareaChange}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  startTransition(async () => {
                    await submitProblem(problem);
                  });
                }
              }}
              className={cn(
                'w-full p-4 text-base border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none overflow-y-hidden pr-14',
                error && 'border-destructive focus:ring-destructive',
              )}
              placeholder="Prove that for any integer n, if n^2 is even, then n is even..."
              disabled={isPending}
              rows={1}
            />
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
