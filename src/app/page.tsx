'use client';

import { useAppStore } from '@/state/app-store';
import ProofView from '@/components/features/proof/proof-view';
import HomeView from '@/components/features/home/home-view';
import ExploreView from '@/components/features/explore/explore-view';

export default function HomePage() {
  const view = useAppStore((s) => s.view);
  return (
    <main className="flex min-h-screen bg-background items-center justify-center">
      {view === 'proof' ? <ProofView /> : view === 'explore' ? <ExploreView /> : <HomeView />}
    </main>
  );
}
