'use client';

import * as React from 'react';

import ProblemInputForm from '@/components/problem-input-form';
import { HomeHeader } from '@/components/features/home/home-header';
import HomeExamples from '@/components/features/home/home-examples';
import { HomeFooter } from '@/components/features/home/home-footer';
import { HomeModeToggle, type HomeMode } from '@/components/features/home/home-mode-toggle';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { useRouter } from 'next/navigation';

export default function HomeView() {
  const [mode, setMode] = React.useState<HomeMode>('prove');
  const router = useRouter();

  const hasDraft = useAppStore((s) => (s.workspaceDoc || '').trim().length > 0);
  const hasExploreSession = useAppStore((s) =>
    s.exploreHasSession ||
    s.exploreMessages.length > 0 ||
    Boolean((s.exploreSeed || '').trim()) ||
    Boolean(s.exploreArtifacts),
  );

  return (
    <div className="w-full max-w-5xl mx-auto p-8 flex flex-col">
      <HomeHeader />
      <div className="-mt-2 mb-6">
        <HomeModeToggle mode={mode} onChange={setMode} />
        <div className="mt-2 text-center text-xs text-muted-foreground">
          {mode === 'explore'
            ? 'Analyse the problem and formulate a precise statement to be proved.'
            : mode === 'write'
              ? 'Draft and refine your notes.'
              : 'Attempt and structure a proof of your statement.'}
        </div>
      </div>

      <div className="mb-6 flex flex-col items-center justify-center gap-3">
        {mode === 'prove' ? (
          <div className="w-full">
            <ProblemInputForm mode={mode} />
          </div>
        ) : mode === 'explore' ? (
          <div className="flex items-center justify-center gap-2">
            <Button
              size="lg"
              onClick={() => {
                router.push('/explore?new=1');
              }}
            >
              Start exploring
            </Button>
            {hasExploreSession && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  router.push('/explore');
                }}
              >
                Continue exploring
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Button size="lg" onClick={() => router.push('/workspace')}>
              {hasDraft ? 'Continue writing' : 'Start writing'}
            </Button>
            {hasDraft && (
              <Button variant="outline" size="lg" onClick={() => router.push('/workspace?new=1')}>
                New document
              </Button>
            )}
          </div>
        )}
      </div>

      <HomeExamples />
      <HomeFooter />
    </div>
  );
}
