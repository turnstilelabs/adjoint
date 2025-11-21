import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';

export function ProofLoading() {
  const problem = useAppStore((s) => s.problem);
  const loading = useAppStore((s) => s.loading);
  const reset = useAppStore((s) => s.reset);
  const progressLog = useAppStore((s) => s.progressLog);
  const liveDraft = useAppStore((s) => s.liveDraft);
  const isDraftStreaming = useAppStore((s) => s.isDraftStreaming);
  // const editProblem = useAppStore((s) => s.editProblem);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [renderMath, setRenderMath] = useState(false);

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



        {progressLog && progressLog.length > 0 && (
          <div className="mt-4 w-full max-w-xl rounded-md bg-muted/30 p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-foreground/60">
              Progress <span className="ml-2 text-foreground/50">{minutes}:{seconds}</span>
            </p>
            <ul className="space-y-1 text-xs font-mono text-foreground/80">
              {progressLog.slice(-6).map((line, idx) => (
                <li key={idx}>• {line}</li>
              ))}
            </ul>
          </div>
        )}
        {liveDraft && liveDraft.length > 0 && (
          <div className="mt-4 w-full max-w-xl rounded-md border p-3 bg-background">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-foreground/60">
                Live draft {isDraftStreaming ? '(streaming...)' : '(complete)'}
              </p>
              {!isDraftStreaming && (
                <button
                  className="text-xs underline text-primary"
                  onClick={() => setRenderMath((v) => !v)}
                >
                  {renderMath ? 'Show plain text' : 'Render math'}
                </button>
              )}
            </div>
            {renderMath && !isDraftStreaming ? (
              <div className="prose max-w-none">
                <KatexRenderer content={liveDraft} />
              </div>
            ) : (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs font-mono text-foreground/90">
                {liveDraft}
              </pre>
            )}
          </div>
        )}
      </div>
      <div className="mt-8 flex items-center gap-2">
        <Button variant="outline" onClick={reset}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
