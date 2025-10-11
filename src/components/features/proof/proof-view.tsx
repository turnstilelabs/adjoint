'use client';

import ProofDisplay from '@/components/features/proof/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/features/proof/proof-loading';

export default function ProofView() {
  const { problem, sublemmas, messages, loading } = useAppStore((s) => ({
    problem: s.problem,
    sublemmas: s.sublemmas,
    messages: s.messages,
    loading: s.loading,
  }));
  const reset = useAppStore((s) => s.reset);

  return loading || sublemmas.length === 0 ? (
    <ProofLoading problem={problem} onReset={reset} />
  ) : (
    <ProofDisplay initialProblem={problem!} />
  );
}
