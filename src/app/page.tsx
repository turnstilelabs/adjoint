'use client';

import { useAppStore } from '@/state/app-store';
import ProofView from '@/components/features/proof/proof-view';
import HomeView from '@/components/features/home/home-view';
import ExploreView from '@/components/features/explore/explore-view';
import { AppViewport } from '@/components/app-viewport';

export default function HomePage() {
  const view = useAppStore((s) => s.view);
  return (
    <AppViewport>
      {view === 'proof' ? <ProofView /> : view === 'explore' ? <ExploreView /> : <HomeView />}
    </AppViewport>
  );
}
