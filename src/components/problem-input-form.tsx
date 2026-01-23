'use client';

import { useState, useTransition } from 'react';
import { ArrowUpRight, AlertCircle } from 'lucide-react';

import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import type { HomeMode } from '@/components/features/home/home-mode-toggle';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from './ui/alert';
import { useAppStore } from '@/state/app-store';

export default function ProblemInputForm({ mode }: { mode: HomeMode }) {
  const lastProblem = useAppStore((s) => s.lastProblem);
  const [problem, setProblem] = useState(lastProblem ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const startProof = useAppStore((s) => s.startProof);
  const startExplore = useAppStore((s) => s.startExplore);

  const submitProblem = async (text: string) => {
    const trimmedProblem = text.trim();
    if (!trimmedProblem) {
      setError('Please enter a problem to solve.');
      return;
    }
    setError(null);

    // UX: do not gate the Prove flow behind a “is this math?” validator.
    // Let the proof attempt pipeline handle arbitrary input.
    await startProof(trimmedProblem);
  };

  const runExplore = () => {
    const trimmed = problem.trim();
    startExplore(trimmed || undefined);
    const url = trimmed ? `/explore?q=${encodeURIComponent(trimmed)}` : '/explore';
    router.push(url);
  };

  const runProve = async () => {
    await submitProblem(problem);
  };

  const runCurrentMode = () => {
    startTransition(async () => {
      if (mode === 'explore') {
        runExplore();
      } else {
        await runProve();
      }
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    runCurrentMode();
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
    <Card className="border-border/50">
      <CardContent className="p-4">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Textarea
              value={problem}
              onChange={handleTextareaChange}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  runCurrentMode();
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
            <button
              type="submit"
              disabled={isPending}
              className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
              aria-label={mode === 'explore' ? 'Explore this problem with Adjoint' : 'Attempt a proof of this statement with Adjoint'}
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
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
