'use client';
import ProofDisplay from '@/components/proof-display';
import { Suspense, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { decomposeProblemAction } from '@/app/actions';
import { type Message } from '@/components/interactive-chat';

function ProofPageContent() {
  const searchParams = useSearchParams();
  const [problem, setProblem] = useState<string | null>(null);
  const [sublemmas, setSublemmas] = useState<string[]>([]);
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
    setMessages([{ role: 'user', content: problemParam }]);

    startTransition(async () => {
      decompositionRan.current = true;
      const result = await decomposeProblemAction(problemParam);
      if (result.success && result.sublemmas) {
        setSublemmas(result.sublemmas);
        const assistantMessage = `Of course. I've broken down the problem into the following steps:\n\n${result.sublemmas.map((s, i) => `**Step ${i + 1}:** ${s}`).join('\n\n')}`;
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

  if (!problem) {
    return <LoadingState message="Loading..." />;
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
      <div className="text-center">
        <p className="text-lg">{message}</p>
      </div>
    </div>
  );
}
