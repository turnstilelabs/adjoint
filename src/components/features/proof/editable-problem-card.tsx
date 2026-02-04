import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/state/app-store';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KatexRenderer } from '@/components/katex-renderer';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { RejectionPanel } from '@/components/features/proof/rejection-panel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RotateCcw } from 'lucide-react';

function EditableProblemCard() {
  const problem = useAppStore((s) => s.problem!);
  const macros = useAppStore((s) => s.proofRenderMacros);
  const originalProblem = useAppStore((s) => s.originalProblem);
  const startProof = useAppStore((s) => s.startProof);
  const startExploreFromFailedProof = useAppStore((s) => s.startExploreFromFailedProof);
  const pendingSuggestion = useAppStore((s) => s.pendingSuggestion);
  const pendingRejection = useAppStore((s) => s.pendingRejection);
  const clearRejection = useAppStore((s) => s.clearRejection);
  const acceptSuggestedChange = useAppStore((s) => s.acceptSuggestedChange);
  const clearSuggestion = useAppStore((s) => s.clearSuggestion);
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(problem || '');
  const [isValidatingProblem, startValidateProblem] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [editError, setEditError] = useState<string | null>(null);

  const { toast } = useToast();

  const submit = () => {
    if (isValidatingProblem) return;
    startValidateProblem(async () => {
      setEditError(null);
      const trimmed = value.trim();
      if (!trimmed) {
        setEditError('Please enter a problem to solve.');
        return;
      }

      // UX: do not gate statement edits behind a “is this math?” classifier.
      // Let the prover pipeline decide how to handle the input.
      setIsEditing(false);
      router.push(`/prove?q=${encodeURIComponent(trimmed)}`);
    });
  };

  const cancel = useCallback(() => {
    setIsEditing(false);
    setValue(problem);
    setEditError(null);
  }, [problem]);

  // Close edit mode when clicking outside the problem box
  useEffect(() => {
    if (!isEditing) return;
    const onDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) {
        cancel();
      }
    };
    document.addEventListener('mousedown', onDown, { capture: true });
    return () => document.removeEventListener('mousedown', onDown, { capture: true } as any);
  }, [isEditing, cancel]);

  const hasSuggestion = !!pendingSuggestion;
  const hasRejection = !!pendingRejection;

  return (
    <Card className={`mb-1 ${hasSuggestion ? 'border-yellow-500' : ''}`}>
      <CardContent className="pt-6">
        <div ref={containerRef}>
          {isEditing ? (
            <div>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  } else if (e.key === 'Escape') {
                    cancel();
                  }
                }}
                autoFocus
                rows={3}
                className="w-full"
                disabled={isValidatingProblem}
              />
              {isValidatingProblem ? (
                <div className="flex items-center text-sm text-muted-foreground mt-2">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                  Parsing input statement...
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">
                  Press Enter to submit, Shift+Enter for newline, Esc to cancel.
                </div>
              )}
              {editError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <>
              <div
                onDoubleClick={() => {
                  setValue(problem);
                  setIsEditing(true);
                }}
                style={{ cursor: 'pointer' }}
                className={
                  // Prevent very long statements from pushing the whole proof UI off-screen.
                  // Keep the problem area scrollable instead.
                  `max-h-[32vh] overflow-y-auto pr-2 ${hasSuggestion ? 'rounded-md p-2' : ''}`
                }
                data-selection-enabled="1"
              >
                {originalProblem ? (
                  <div className="mb-2 flex items-center justify-end">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              // Toggle the textarea editor and prefill with the original.
                              setValue(originalProblem);
                              setIsEditing(true);
                            }}
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Original</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Original statement</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ) : null}
                <KatexRenderer content={problem} macros={macros} />
              </div>
              {hasRejection && pendingRejection && (
                <RejectionPanel
                  explanation={pendingRejection.explanation}
                  onDismiss={() => clearRejection()}
                  onEdit={() => setIsEditing(true)}
                  onRetry={async () => {
                    clearRejection();
                    await startProof(problem, { force: true });
                  }}
                  onExplore={() => {
                    // Seed explore chat with the original statement + streamed draft, then navigate.
                    startExploreFromFailedProof();
                    router.push('/explore');
                  }}
                />
              )}

              {hasSuggestion && pendingSuggestion && (
                <div className="mt-3 p-3 rounded-md border border-muted bg-background text-foreground shadow-sm">
                  <div className="text-sm mb-2 font-medium">
                    The AI was unable to prove this statement and proposed an alternative formulation:
                  </div>

                  <div className="text-sm p-2 rounded-md bg-background border border-muted" data-selection-enabled="1">
                    <KatexRenderer content={pendingSuggestion.provedStatement} macros={macros} />
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Button size="sm" onClick={acceptSuggestedChange}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        clearSuggestion();
                        await startProof(problem, { force: true });
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {pendingSuggestion.explanation}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default EditableProblemCard;
