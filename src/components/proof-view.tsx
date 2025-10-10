"use client";

import { Card, CardContent } from '@/components/ui/card';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KatexRenderer } from '@/components/katex-renderer';
import ProofDisplay from '@/components/proof-display';
import { useAppStore } from '@/state/app-store';

export default function ProofView() {
  const { problem, sublemmas, messages, loading } = useAppStore((s) => ({
    problem: s.problem,
    sublemmas: s.sublemmas,
    messages: s.messages,
    loading: s.loading,
  }));
  const setMessages = useAppStore((s) => s.setMessages);
  const goHome = useAppStore((s) => s.goHome);

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
