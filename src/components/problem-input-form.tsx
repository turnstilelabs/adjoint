'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from './ui/card';
import { validateStatementAction } from '@/app/actions';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from './ui/alert';

export default function ProblemInputForm() {
  const [problem, setProblem] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedProblem = problem.trim();
    if (!trimmedProblem) {
      setError('Please enter a problem to solve.');
      return;
    }

    startTransition(async () => {
      setError(null);
      const validationResult = await validateStatementAction(trimmedProblem);

      if (validationResult.success && validationResult.validity === 'VALID') {
        const params = new URLSearchParams();
        params.append('problem', trimmedProblem);
        router.push(`/proof?${params.toString()}`);
      } else if (validationResult.success) {
        setError("Looks like that’s not math! This app only works with math problems.");
      }
      else {
        const errorMessage = validationResult.error || "An unexpected error occurred while validating the problem.";
        setError(errorMessage);
        toast({
          title: 'Validation Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
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
              className={cn(
                "w-full p-4 text-base border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none overflow-y-hidden pr-14",
                error && "border-destructive focus:ring-destructive"
              )}
              placeholder="Prove that for any integer n, if n^2 is even, then n is even..."
              disabled={isPending}
              rows={1}
            />
            <div className="absolute bottom-3 right-3 flex items-center space-x-3">
              <Button type="button" size="icon" variant="ghost" className="rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200" title="Upload Image" disabled={isPending}>
                <ImageIcon className="h-5 w-5" />
                <span className="sr-only">Upload Image</span>
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-4 flex flex-col sm:flex-row justify-end items-center gap-4">
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto font-semibold text-lg py-3 px-8 shadow-md hover:shadow-lg"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-5 w-5" />
                  Decompose
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
