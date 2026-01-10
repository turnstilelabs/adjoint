'use client';

import * as React from 'react';

import ProblemInputForm from '@/components/problem-input-form';
import { HomeHeader } from '@/components/features/home/home-header';
import HomeExamples from '@/components/features/home/home-examples';
import { HomeFooter } from '@/components/features/home/home-footer';
import { HomeModeToggle, type HomeMode } from '@/components/features/home/home-mode-toggle';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';

export default function HomeView() {
  const [mode, setMode] = React.useState<HomeMode>('prove');
  const newWorkspace = useAppStore((s) => s.newWorkspace);
  const startWorkspace = useAppStore((s) => s.startWorkspace);
  const hasDraft = useAppStore((s) => (s.workspaceDoc || '').trim().length > 0);

  return (
    <div className="w-full max-w-5xl mx-auto p-8 flex flex-col">
      <HomeHeader />
      <div className="-mt-2 mb-6">
        <HomeModeToggle mode={mode} onChange={setMode} />
        <div className="mt-2 text-center text-xs text-muted-foreground">
          {mode === 'explore'
            ? 'Analyse the problem and formulate a precise statement to be proved.'
            : 'Attempt and structure a proof of your statement.'}
        </div>
      </div>

      <div className="mb-6 flex items-center justify-center gap-2">
        <Button size="lg" onClick={() => newWorkspace()}>
          New draft
        </Button>
        {hasDraft && (
          <Button variant="outline" size="lg" onClick={() => startWorkspace()}>
            Continue draft
          </Button>
        )}
      </div>

      <ProblemInputForm mode={mode} />
      <HomeExamples />
      <HomeFooter />
    </div>
  );
}
