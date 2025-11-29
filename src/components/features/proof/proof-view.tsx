'use client';

import ProofDisplay from '@/components/features/proof/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/features/proof/proof-loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Pencil } from 'lucide-react';

export default function ProofView() {
  const { loading, proof, startProof, problem, error, retry, editProblem } =
    useAppStore((s) => ({
      loading: s.loading,
      proof: s.proof,
      startProof: s.startProof,
      problem: s.problem,
      error: s.error,
      retry: s.retry,
      editProblem: s.editProblem,
    }));

  if (!loading && error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex gap-2">
                <Button onClick={retry}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button variant="secondary" onClick={editProblem}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </div>
            </div>
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
