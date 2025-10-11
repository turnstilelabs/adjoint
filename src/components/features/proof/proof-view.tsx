'use client';

import ProofDisplay from '@/components/features/proof/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/features/proof/proof-loading';

export default function ProofView() {
  const proof = useAppStore((s) => s.proof());
  const loading = useAppStore((s) => s.loading);

  return loading || !proof ? <ProofLoading /> : <ProofDisplay />;
}
