import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';
import { Loader2, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';

export function ProofLoading() {
  const problem = useAppStore((s) => s.problem);
  const loading = useAppStore((s) => s.loading);
  const reset = useAppStore((s) => s.reset);
  const editProblem = useAppStore((s) => s.editProblem);

  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!loading) return;
    setElapsedMs(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 1000);
    return () => clearInterval(id);
  }, [loading]);

  const minutes = String(Math.floor(elapsedMs / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="max-w-5xl flex flex-col items-center justify-center p-8">
      <Card className="text-left">
        <CardContent className="pt-6">
          {problem ? <KatexRenderer content={problem} /> : <p>Loading problem statement...</p>}
        </CardContent>
      </Card>
      <div className="mt-12 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium">Generating proof steps...</p>
        <p className="text-sm">The AI is thinking. This may take a moment.</p>
        <p className="text-xs font-mono text-foreground/70">Elapsed: {minutes}:{seconds}</p>
      </div>
      <div className="mt-8 flex items-center gap-2">
        <Button variant="secondary" onClick={editProblem}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <Button variant="outline" onClick={reset}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
