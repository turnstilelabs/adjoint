import { Card, CardContent } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';

export function ProofLoading() {
  const problem = useAppStore((s) => s.problem);
  const reset = useAppStore((s) => s.reset);

  return (
    <div className="max-w-5xl flex flex-col items-center justify-center p-8">
      <Card className="text-left">
        <CardContent className="pt-6">
          {problem ? <KatexRenderer content={problem} /> : <p>Loading problem statement...</p>}
        </CardContent>
      </Card>
      <div className="mt-12 flex flex-col items-center gap-4 text-muted-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium">Generating proof steps...</p>
        <p className="text-sm">The AI is thinking. This may take a moment.</p>
      </div>
      <Button variant="outline" onClick={reset} className="mt-8">
        <X className="mr-2 h-4 w-4" />
        Cancel
      </Button>
    </div>
  );
}
