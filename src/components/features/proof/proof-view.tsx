'use client';

import ProofDisplay from '@/components/features/proof/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/features/proof/proof-loading';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProofView() {
  const searchParams = useSearchParams();
  const problemParam = searchParams.get('problem');
  const decompositionRan = useRef(false);

  const [initialError, setInitialError] = useState<string | null>(null);

  const { loading, proof, startProof } = useAppStore((s) => ({
    loading: s.loading,
    proof: s.proof,
    startProof: s.startProof,
  }));

  useEffect(() => {
    if (problemParam && !decompositionRan.current) {
      decompositionRan.current = true;
      startProof(problemParam);
    } else if (!problemParam && !decompositionRan.current) {
      setInitialError('No problem statement found in the URL.');
    }
  }, [problemParam, startProof]);

  if (initialError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="w-1/2">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{initialError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !proof()) {
    return <ProofLoading />;
  }

  return <ProofDisplay />;
}