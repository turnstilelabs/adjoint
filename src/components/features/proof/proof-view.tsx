'use client';

import ProofDisplay from '@/components/features/proof/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/features/proof/proof-loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProofView() {
  const { loading, proof, startProof, problem } = useAppStore((s) => ({
    loading: s.loading,
    proof: s.proof,
    startProof: s.startProof,
    problem: s.problem,
  }));
  const error = useAppStore((s) => s.error);

  if (!loading && error) {
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

  if (loading || !proof()) {
    return <ProofLoading />;
  }

  return <ProofDisplay />;
}
