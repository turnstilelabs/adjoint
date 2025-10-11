import { Card, CardContent } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ProofLoading(props: { problem: string | null; onReset: () => void }) {
  return (
    <div className="max-w-5xl flex flex-col items-center justify-center p-8">
      <Card className="text-left">
        <CardContent className="pt-6">
          {props.problem ? (
            <KatexRenderer content={props.problem} />
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
      <Button variant="outline" onClick={props.onReset} className="mt-8">
        <X className="mr-2 h-4 w-4" />
        Cancel
      </Button>
    </div>
  );
}
