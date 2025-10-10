import { Card, CardContent } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ProofLoading(props: { problem: string | null; onReset: () => void }) {
  return (
    <div>
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
      <div className="mt-8">
        <Button variant="outline" onReset={props.onReset}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
