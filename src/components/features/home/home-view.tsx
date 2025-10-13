'use client';

import ProblemInputForm from '@/components/problem-input-form';
import { HomeHeader } from '@/components/features/home/home-header';
import HomeExamples from '@/components/features/home/home-examples';
import { HomeFooter } from '@/components/features/home/home-footer';

export default function HomeView() {
  return (
    <div className="w-full max-w-5xl mx-auto p-8 flex flex-col">
      <HomeHeader />
      <ProblemInputForm />
      <HomeExamples />
      <HomeFooter />
    </div>
  );
}
