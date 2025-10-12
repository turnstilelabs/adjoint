'use client';
import ProofDisplay from '@/components/proof-display';
import { Suspense, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { decomposeProblemAction } from '@/app/actions';
import { type Message } from '@/components/interactive-chat';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { Loader2, X } from 'lucide-react';
import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Header } from '@/components/header';

function ProofPageContent() {
  const searchParams = useSearchParams();
  const [problem, setProblem] = useState<string | null>(null);
  const [sublemmas, setSublemmas] = useState<Sublemma[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const decompositionRan = useRef(false);

  useEffect(() => {
    const problemParam = searchParams.get('problem');
    if (problemParam) {
      setProblem(problemParam);
      // Reset decomposition state so navigating to a new problem will trigger decomposition again
      setSublemmas([]);
      setMessages([]);
      decompositionRan.current = false;
    } else {
      setError('Missing problem in the URL.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!problem || decompositionRan.current) {
      return;
    }
    decompositionRan.current = true;

    setMessages([]);

    startTransition(async () => {
      // Short delay to allow UI to render first
      await new Promise(resolve => setTimeout(resolve, 50));
      const result = await decomposeProblemAction(problem);
      if (result.success && result.sublemmas) {
        setSublemmas(result.sublemmas);
        const assistantMessage = `Of course. I've broken down the problem into the following steps:\n\n${result.sublemmas
          .map((s, i) => `**${s.title}**\nStatement: ${s.statement}\nProof: ${s.proof}`)
          .join('\n\n')}`;
        setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
      } else {
        setError(result.error || 'Failed to decompose the problem.');
      }
    });
  }, [problem]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="w-1/2">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isPending || sublemmas.length === 0) {
    return (
      <LoadingState problem={problem} />
    );
  }

  return (
    <ProofDisplay
      initialProblem={problem!}
      sublemmas={sublemmas}
      isLoading={isPending}
      messages={messages}
      setMessages={setMessages}
    />
  );
}

export default function ProofPage() {
  return (
    <Suspense fallback={<InitialLoading />}>
      <ProofPageContent />
    </Suspense>
  );
}

function InitialLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium">Loading problem...</p>
      </div>
    </div>
  );
}

function LoadingState({ problem }: { problem: string | null }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <Header />
            <p className="mt-2 text-lg text-gray-600">
              Your canonical companion in reasoning.
            </p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl mx-auto text-center">
          <Card className='text-left'>
            <CardContent className="pt-6">
              {problem ? <KatexRenderer content={problem} /> : <p>Loading problem statement...</p>}
            </CardContent>
          </Card>
          <div className="mt-12 flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-lg font-medium">Generating proof steps...</p>
            <p className="text-sm">The AI is thinking. This may take a moment.</p>
          </div>
          <div className="mt-8">
            <Button variant="outline" onClick={() => router.push('/')}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
