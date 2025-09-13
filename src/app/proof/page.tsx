'use client';
import ProofDisplay from '@/components/proof-display';
import { Suspense, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { decomposeProblemAction } from '@/app/actions';
import { type Message } from '@/components/interactive-chat';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { Loader2 } from 'lucide-react';

function ProofPageContent() {
  const searchParams = useSearchParams();
  const [problem, setProblem] = useState<string | null>(null);
  const [sublemmas, setSublemmas] = useState<Sublemma[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const decompositionRan = useRef(false);

  useEffect(() => {
    if (decompositionRan.current) {
      return;
    }
    const problemParam = searchParams.get('problem');

    if (!problemParam) {
      setError('Missing problem in the URL.');
      return;
    }
    
    setProblem(problemParam);
    setMessages([]);

    startTransition(async () => {
      decompositionRan.current = true;
      const result = await decomposeProblemAction(problemParam);
      if (result.success && result.sublemmas) {
        setSublemmas(result.sublemmas);
        const assistantMessage = `Of course. I've broken down the problem into the following steps:\n\n${result.sublemmas.map((s, i) => `**${s.title}:** ${s.content}`).join('\n\n')}`;
        setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
      } else {
        setError(result.error || 'Failed to decompose the problem.');
      }
    });
  }, [searchParams]);

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

  if (isPending || !problem) {
    return (
      <LoadingState message="Generating proof steps..." />
    );
  }
  
  return (
    <ProofDisplay
      initialProblem={problem}
      sublemmas={sublemmas}
      isLoading={isPending}
      messages={messages}
      setMessages={setMessages}
    />
  );
}

export default function ProofPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading page..." />}>
      <ProofPageContent />
    </Suspense>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium">{message}</p>
        <p className="text-sm">The AI is thinking. This may take a moment.</p>
      </div>
    </div>
  );
}
