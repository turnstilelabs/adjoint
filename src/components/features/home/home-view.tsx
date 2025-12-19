'use client';

import * as React from 'react';

import ProblemInputForm from '@/components/problem-input-form';
import { HomeHeader } from '@/components/features/home/home-header';
import HomeExamples from '@/components/features/home/home-examples';
import { HomeFooter } from '@/components/features/home/home-footer';
import { HomeModeToggle, type HomeMode } from '@/components/features/home/home-mode-toggle';

export default function HomeView() {
  const [mode, setMode] = React.useState<HomeMode>('prove');

  return (
    <div className="w-full max-w-5xl mx-auto p-8 flex flex-col">
      <HomeHeader />
      <div className="-mt-2 mb-6">
        <HomeModeToggle mode={mode} onChange={setMode} />
      </div>
      <ProblemInputForm mode={mode} />
      <HomeExamples />
      <HomeFooter />
    </div>
  );
}
