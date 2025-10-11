'use client';

import { useAppStore } from '@/state/app-store';
import ProofView from '@/components/proof-view';
import HomeView from '@/components/features/home/home-view';

export default function HomePage() {
  const view = useAppStore((s) => s.view);
  return (
    <main className="flex min-h-screen bg-background items-center justify-center">
      {view === 'proof' ? <ProofView /> : <HomeView />}
    </main>
  );
}
