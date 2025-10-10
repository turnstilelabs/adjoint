'use client';

import { useAppStore } from '@/state/app-store';
import ProofView from '@/components/proof-view';
import HomeView from '@/components/home-view';

export default function HomePage() {
  const view = useAppStore((s) => s.view);
  return view === 'proof' ? <ProofView /> : <HomeView />;
}
