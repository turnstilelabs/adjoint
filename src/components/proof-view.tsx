'use client';

import ProofDisplay from '@/components/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/proof-loading';

export default function ProofView() {
  const { problem, sublemmas, messages, loading } = useAppStore((s) => ({
    problem: s.problem,
    sublemmas: s.sublemmas,
    messages: s.messages,
    loading: s.loading,
  }));
  const reset = useAppStore((s) => s.reset);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full text-center">
          {loading || sublemmas.length === 0 ? (
            <ProofLoading problem={problem} onReset={reset} />
          ) : (
            <ProofDisplay initialProblem={problem!} />
          )}
        </div>
      </main>
    </div>
  );
}
