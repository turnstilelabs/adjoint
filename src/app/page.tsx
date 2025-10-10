'use client';

import ProblemInputForm from '@/components/problem-input-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KatexRenderer } from '@/components/katex-renderer';
import { Header } from '@/components/header';
import { useAppStore } from '@/state/app-store';
import ProofDisplay from '@/components/proof-display';

const exampleProblems = [
  {
    level: 'IMO-Level Inequality',
    problem:
      'Let $a, b, c$ be positive real numbers such that $abc = 1$. Prove that $\\frac{1}{a^3(b+c)} + \\frac{1}{b^3(c+a)} + \\frac{1}{c^3(a+b)} \\ge \\frac{3}{2}$.',
  },
  {
    level: "Lagrange's Theorem",
    problem:
      'Prove that if $G$ is a finite group and $H$ is a subgroup of $G$, then the order of $H$ divides the order of $G$.',
  },
  {
    level: 'Banach-Alaoglu Theorem',
    problem:
      'Prove that the closed unit ball in the dual of a normed vector space is compact in the weak-* topology.',
  },
];

export default function Home() {
  const { view, problem, sublemmas, messages, loading } = useAppStore((s) => ({
    view: s.view,
    problem: s.problem,
    sublemmas: s.sublemmas,
    messages: s.messages,
    loading: s.loading,
  }));
  const startProof = useAppStore((s) => s.startProof);
  const setMessages = useAppStore((s) => s.setMessages);
  const goHome = useAppStore((s) => s.goHome);

  if (view === 'proof') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1 flex items-center justify-center">
          <div className="w-full text-center">
            {loading || sublemmas.length === 0 ? (
              <div>
                <Card className="text-left">
                  <CardContent className="pt-6">
                    {problem ? (
                      <KatexRenderer content={problem} />
                    ) : (
                      <p>Loading problem statement...</p>
                    )}
                  </CardContent>
                </Card>
                <div className="mt-12 flex flex-col items-center gap-4 text-muted-foreground">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-lg font-medium">Generating proof steps...</p>
                  <p className="text-sm">The AI is thinking. This may take a moment.</p>
                </div>
                <div className="mt-8">
                  <Button variant="outline" onClick={goHome}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ProofDisplay
                initialProblem={problem!}
                sublemmas={sublemmas}
                isLoading={loading}
                messages={messages}
                setMessages={setMessages as any}
              />
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <main className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <Header />
              <p className="mt-2 text-lg text-gray-600">Your canonical companion in reasoning.</p>
            </div>
            <ProblemInputForm />
            <div className="mt-16 text-center">
              <h2 className="text-2xl font-bold font-headline text-gray-800">
                Or, start with an example
              </h2>
              <div className="mt-8 grid gap-8 md:grid-cols-3">
                {exampleProblems.map((example, index) => (
                  <Card key={index} className="text-left flex flex-col">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-primary">
                        {example.level}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <KatexRenderer content={example.problem} className="text-sm" />
                    </CardContent>
                    <div className="p-6 pt-0 mt-auto">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => startProof(example.problem)}
                      >
                        Explore Proof <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
            <div className="mt-16 text-center">
              <p className="text-sm text-gray-500">
                Some nice message about the project.
                <a href="#" className="text-primary hover:underline ml-1">
                  Learn more
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
