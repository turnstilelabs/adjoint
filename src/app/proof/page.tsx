'use client';
import { AppSidebar } from '@/components/sidebar';
import ProofDisplay from '@/components/proof-display';
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

function ProofPageContent({ problem, sublemmas }: { problem: string, sublemmas: string[] }) {
  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <ProofDisplay initialProblem={problem} initialSublemmas={sublemmas} />
    </div>
  );
}

export default function ProofPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ProofPageWrapper />
    </Suspense>
  )
}

function ProofPageWrapper() {
  const searchParams = useSearchParams();
  const [problem, setProblem] = useState('');
  const [sublemmas, setSublemmas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const problemParam = searchParams.get('problem');
    const sublemmasParam = searchParams.get('sublemmas');

    if (!problemParam || !sublemmasParam) {
      setError('Missing problem or sublemmas in the URL.');
      return;
    }

    try {
      const parsedSublemmas = JSON.parse(sublemmasParam);
      if (!Array.isArray(parsedSublemmas)) {
        throw new Error("Sublemmas is not an array.");
      }
      setProblem(problemParam);
      setSublemmas(parsedSublemmas);
    } catch (e) {
      console.error(e);
      setError('Failed to parse sublemmas from URL.');
    }
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
  
  if (!problem || sublemmas.length === 0) {
    return <LoadingState />
  }

  return <ProofPageContent problem={problem} sublemmas={sublemmas} />;
}

function LoadingState() {
    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <div className="text-center">
                <p className="text-lg">Loading proof...</p>
            </div>
        </div>
    );
}
