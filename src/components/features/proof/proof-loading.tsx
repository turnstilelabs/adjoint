import { useDeferredValue, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { TriviaCard } from '@/components/features/proof/trivia-card';
import { shuffleTrivia, type MathTriviaItem } from '@/lib/math-trivia';
import { ProofStreamMarkdown } from '@/components/proof/proof-stream-markdown';

export function ProofLoading() {
  const router = useRouter();
  const problem = useAppStore((s) => s.problem);
  const macros = useAppStore((s) => s.proofRenderMacros);
  const loading = useAppStore((s) => s.loading);
  const cancelProofAttempt = useAppStore((s) => s.cancelProofAttempt);
  const progressLog = useAppStore((s) => s.progressLog);
  const liveDraft = useAppStore((s) => s.liveDraft);
  const isDraftStreaming = useAppStore((s) => s.isDraftStreaming);
  // const editProblem = useAppStore((s) => s.editProblem);

  const [elapsedMs, setElapsedMs] = useState(0);
  // Default to math rendering during streaming (requested UX)
  const [renderMath, setRenderMath] = useState(false);


  // While streaming, force math rendering on.
  useEffect(() => {
    if (isDraftStreaming) setRenderMath(true);
  }, [isDraftStreaming]);

  // Trivia: show only after we know the model and before first token arrives.
  const [triviaDeck, setTriviaDeck] = useState<MathTriviaItem[]>([]);
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [triviaVisible, setTriviaVisible] = useState(false);
  const [triviaLoadError, setTriviaLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    setElapsedMs(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 1000);
    return () => clearInterval(id);
  }, [loading]);


  // Derive whether the model name has been displayed in the progress log.
  const hasModelName = !!(progressLog || []).some((l) => typeof l === 'string' && l.startsWith('Using '));
  const hasFirstToken = (liveDraft || '').length > 0;
  const showTriviaBeforeTokens = loading && hasModelName && !hasFirstToken;

  // If the streamed draft is finished and we are in the classify phase, show trivia again.
  // (Classification can take a while and the user otherwise stares at a static log line.)
  const isClassifying =
    loading &&
    hasFirstToken &&
    !isDraftStreaming &&
    !!(progressLog || []).some((l) => typeof l === 'string' && /Classifying draft/.test(l));

  const shouldShowTrivia = showTriviaBeforeTokens || isClassifying;

  // Rendering KaTeX on every token can be expensive; defer updates slightly to keep UI responsive.
  const deferredLiveDraft = useDeferredValue(liveDraft);

  const currentTrivia = triviaDeck.length
    ? triviaDeck[((triviaIndex % triviaDeck.length) + triviaDeck.length) % triviaDeck.length]
    : null;

  // Load + shuffle trivia once per proof attempt (i.e. per loading session).
  useEffect(() => {
    if (!loading) return;

    let cancelled = false;
    setTriviaLoadError(null);
    setTriviaDeck([]);
    setTriviaIndex(0);

    (async () => {
      try {
        const resp = await fetch('/api/trivia', { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const items = (await resp.json()) as MathTriviaItem[];
        if (!Array.isArray(items)) throw new Error('Malformed trivia dataset');
        if (cancelled) return;
        setTriviaDeck(shuffleTrivia(items));
      } catch (e) {
        if (cancelled) return;
        setTriviaLoadError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading]);

  // When trivia becomes eligible to show, start rotation every 10s.
  useEffect(() => {
    if (!shouldShowTrivia) {
      setTriviaVisible(false);
      return;
    }

    setTriviaVisible(true);

    const id = window.setInterval(() => {
      setTriviaIndex((i) => i + 1);
    }, 10000);

    return () => window.clearInterval(id);
  }, [shouldShowTrivia]);

  const minutes = String(Math.floor(elapsedMs / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');

  return (
    // Keep the same reading measure as the main proof page (`ProofDisplay`): max-w-4xl.
    <div className="mx-auto w-full max-w-4xl p-3 md:p-10 flex flex-col items-center justify-start min-h-screen">
      <Card className="w-full text-left">
        <CardContent className="pt-6">
          {problem ? (
            <div
              className={
                // Prevent very long statements from pushing the progress/log UI below the fold.
                // Keep the statement area scrollable during streaming/loading.
                'max-h-[32vh] overflow-y-auto pr-2'
              }
            >
              <KatexRenderer content={problem} macros={macros} />
            </div>
          ) : (
            <p>Loading problem statement...</p>
          )}
        </CardContent>
      </Card>
      <div className="mt-12 flex flex-col items-center gap-3 text-muted-foreground">
            {progressLog && progressLog.length > 0 && (
              <div className="mt-4 w-full rounded-md bg-muted/30 p-3">
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

            {/* Trivia appears (a) after model is known and before first token arrives, and
                (b) again during the classify phase once the draft is complete. */}
            {shouldShowTrivia && !triviaLoadError && currentTrivia && (
              <div
                className={
                  'mt-4 w-full flex justify-center transition-all duration-300 ease-out overflow-hidden ' +
                  (triviaVisible ? 'opacity-100 max-h-64 translate-y-0' : 'opacity-0 max-h-0 -translate-y-1 pointer-events-none')
                }
              >
                <TriviaCard item={currentTrivia} />
              </div>
            )}

            {liveDraft && liveDraft.length > 0 && (
              <div className="mt-4 w-full rounded-md border p-3 bg-background">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-foreground/60">
                    Live draft {isDraftStreaming ? '(streaming...)' : '(complete)'}
                  </p>
                  <button
                    className="text-xs underline text-primary"
                    onClick={() => setRenderMath((v) => !v)}
                  >
                    {renderMath ? 'Show plain text' : 'Render math'}
                  </button>
                </div>
                {renderMath ? (
                  <div className="prose max-w-full">
                    <ProofStreamMarkdown content={deferredLiveDraft || ''} macros={macros} />
                  </div>
                ) : (
                  <pre className="max-w-full whitespace-pre-wrap break-words text-xs font-mono text-foreground/90">
                    {liveDraft}
                  </pre>
                )}
              </div>
            )}
      </div>
      <div className="mt-8 flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            cancelProofAttempt();
            // If Prove was opened from Explore/Workspace/etc, prefer returning there.
            // This preserves the user’s previous mode + in-memory state.
            try {
              router.back();
            } catch {
              router.push('/workspace');
            }
          }}
        >
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
