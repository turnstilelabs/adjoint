import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { validateStatementAction } from '@/app/actions';
import { useAppStore } from '@/state/app-store';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KatexRenderer } from '@/components/katex-renderer';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

function EditableProblemCard() {
  const problem = useAppStore((s) => s.problem!);
  const startProof = useAppStore((s) => s.startProof);
  const pendingSuggestion = useAppStore((s) => s.pendingSuggestion);
  const acceptSuggestedChange = useAppStore((s) => s.acceptSuggestedChange);
  const clearSuggestion = useAppStore((s) => s.clearSuggestion);

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
      console.debug('[UI][EditableProblemCard] validate edited problem len=', trimmed.length);
      const result = await validateStatementAction(trimmed);
      console.debug('[UI][EditableProblemCard] validation done validity=', (result as any)?.validity);
      if ('validity' in result && result.validity === 'VALID') {
        console.debug('[UI][EditableProblemCard] calling startProof');
        setIsEditing(false);
        await startProof(trimmed);
      } else if ('validity' in result) {
        setEditError('Looks like that’s not math! This app only works with math problems.');
      } else {
        const errorMessage =
          result.error || 'An unexpected error occurred while validating the problem.';
        setEditError(errorMessage);
        toast({
          title: 'Validation Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    });
  };

  const cancel = () => {
    setIsEditing(false);
    setValue(problem);
    setEditError(null);
  };

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
  }, [isEditing]);

  const hasSuggestion = !!pendingSuggestion;

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
                className={hasSuggestion ? 'rounded-md p-2' : undefined}
              >
                <KatexRenderer content={problem} />
              </div>
              {hasSuggestion && pendingSuggestion && (
                <div className="mt-3 p-3 rounded-md border border-muted bg-background text-foreground shadow-sm">
                  <div className="text-sm mb-2 font-medium">
                    The AI was unable to prove this statement and proposed an alternative formulation:
                  </div>

                  <div className="text-sm p-2 rounded-md bg-background border border-muted">
                    <KatexRenderer content={pendingSuggestion.provedStatement} />
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Button size="sm" onClick={acceptSuggestedChange}>
                      Accept Change
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
