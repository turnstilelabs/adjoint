'use client';

import { useState, useTransition } from 'react';
import { ArrowUpRight, AlertCircle } from 'lucide-react';

import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
// Legacy: Home no longer routes into Explore/Prove directly.
// This component is kept only to avoid breaking imports if used elsewhere.
export type HomeMode = 'write';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from './ui/alert';
import { useAppStore } from '@/state/app-store';
import {
  ROUTE_PAYLOAD_MAX_QUERY_CHARS,
  storeRoutePayload,
} from '@/lib/route-payload';

export default function ProblemInputForm({ mode }: { mode: HomeMode }) {
  const lastProblem = useAppStore((s) => s.lastProblem);
  const [problem, setProblem] = useState(lastProblem ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const validate = (text: string) => {
    const trimmedProblem = text.trim();
    if (!trimmedProblem) {
      setError('Please enter a problem to solve.');
      return null;
    }
    setError(null);
    return trimmedProblem;
  };

  const runCurrentMode = () => {
    startTransition(async () => {
      const trimmed = validate(problem);
      if (!trimmed) return;

      // Workspace-first: store the statement in sessionStorage and open Workspace.
      const sid = storeRoutePayload(trimmed);
      if (sid) {
        // We currently have no Workspace sid hydration; fallback to direct seed via URL.
        // (This component is legacy; users should paste into Workspace instead.)
        router.push(`/workspace?seed=${encodeURIComponent(trimmed)}`);
        return;
      }

      if (trimmed.length <= ROUTE_PAYLOAD_MAX_QUERY_CHARS) {
        router.push(`/workspace?seed=${encodeURIComponent(trimmed)}`);
        return;
      }

      toast({
        title: 'Could not open workspace',
        description:
          'This input is too long to place in the URL, and session storage is unavailable in this browser context.',
        variant: 'destructive',
      });
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
              aria-label={'Open workspace'}
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
