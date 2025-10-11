'use client';

import ProofDisplay from '@/components/features/proof/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/features/proof/proof-loading';

export default function ProofView() {
  const proof = useAppStore((s) => s.proof());
  const problem = useAppStore((s) => s.problem);
  const loading = useAppStore((s) => s.loading);
  const reset = useAppStore((s) => s.reset);

  return loading || !proof ? <ProofLoading problem={problem} onReset={reset} /> : <ProofDisplay />;
}
