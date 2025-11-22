import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { validateProofAction } from '@/app/actions';

function ProofValidationFooter() {
  const { toast } = useToast();

  const problem = useAppStore((s) => s.problem!);
  const updateCurrentProofVersion = useAppStore((s) => s.updateCurrentProofVersion);

  const proof = useAppStore((s) => s.proof());

  const [isProofValidating, startValidateProof] = useTransition();

  const [cancelled, setCancelled] = useState(false);
  const cancelledRef = useRef(false);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [canShowCancelCue, setCanShowCancelCue] = useState(false);
  const cancelCueTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (proof.validationResult && alertRef.current) {
      try {
        alertRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch { }
    }
  }, [proof.validationResult]);

  // Allow Esc to cancel while analyzing (desktop accessibility)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRunning) {
        cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRunning]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (cancelCueTimerRef.current) {
        clearTimeout(cancelCueTimerRef.current);
      }
    };
  }, []);

  const handleValidateProof = () => {
    setCancelled(false);
    cancelledRef.current = false;
    setCanShowCancelCue(false);
    if (cancelCueTimerRef.current) {
      clearTimeout(cancelCueTimerRef.current);
      cancelCueTimerRef.current = null;
    }
    cancelCueTimerRef.current = window.setTimeout(() => setCanShowCancelCue(true), 900);
    setIsRunning(true);
    startValidateProof(async () => {
      updateCurrentProofVersion({ validationResult: undefined });

      const result = await validateProofAction(problem, proof.sublemmas);

      if (cancelledRef.current) {
        return;
      }

      if (result.success) {
        updateCurrentProofVersion({
          validationResult: {
            isValid: result.isValid || false,
            isError: false,
            feedback: result.feedback || 'No feedback provided.',
            timestamp: new Date(),
            model: (result as any).model,
          },
        });
        if (!cancelledRef.current) {
          setIsRunning(false);
          setCanShowCancelCue(false);
          if (cancelCueTimerRef.current) {
            clearTimeout(cancelCueTimerRef.current);
            cancelCueTimerRef.current = null;
          }
        }
      } else {
        const friendly =
          'Adjoint’s connection to the model was interrupted, please go back and retry.';
        updateCurrentProofVersion({
          validationResult: {
            isError: true,
            timestamp: new Date(),
            feedback: friendly,
          },
        });
        toast({
          title: 'Validation error',
          description: friendly,
          variant: 'destructive',
        });
        if (!cancelledRef.current) {
          setIsRunning(false);
          setCanShowCancelCue(false);
          if (cancelCueTimerRef.current) {
            clearTimeout(cancelCueTimerRef.current);
            cancelCueTimerRef.current = null;
          }
        }
      }
    });
  };

  const cancel = () => {
    setCancelled(true);
    cancelledRef.current = true;
    setIsRunning(false);
    setCanShowCancelCue(false);
    if (cancelCueTimerRef.current) {
      clearTimeout(cancelCueTimerRef.current);
      cancelCueTimerRef.current = null;
    }
  };

  return (
    <>
      <div className="pt-4 space-y-4">
        {proof.validationResult && (
          <div ref={alertRef}>
            <Alert
              variant={proof.validationResult.isValid ? 'default' : 'destructive'}
              className="bg-card"
            >
              {proof.validationResult.isValid ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}

              <AlertDescription>
                <KatexRenderer content={proof.validationResult.feedback} />
                {proof.validationResult.isValid && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {`Assessed by ${proof.validationResult.model ?? 'AI'}`}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 left-0 right-0 border-t bg-background z-30" aria-busy={isRunning}>
        <div className="max-w-4xl mx-auto p-3 flex items-center justify-end">
          <Button
            onClick={() => {
              if (isRunning) {
                cancel();
              } else {
                handleValidateProof();
              }
            }}
            disabled={!isRunning && proof.sublemmas.length === 0}
            variant={isRunning ? 'secondary' : 'default'}
            className="group min-w-[17rem]"
            aria-busy={isRunning}
          >
            {isRunning ? (
              <span className="relative inline-flex items-center justify-center">
                {/* Running label with animated dots (visible by default) */}
                <span className={`flex items-center gap-2 transition-opacity duration-150 opacity-100 ${canShowCancelCue ? 'group-hover:opacity-0 group-focus-visible:opacity-0' : ''}`}>
                  <span aria-live="polite">Generating analysis</span>
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce" style={{ animationDelay: '160ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce" style={{ animationDelay: '320ms' }} />
                  </span>
                </span>
                {/* Hover/focus label (Cancel) cross-fades in, same footprint */}
                <span className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-150 opacity-0 ${canShowCancelCue ? 'group-hover:opacity-100 group-focus-visible:opacity-100' : ''}`}>
                  Cancel
                </span>
              </span>
            ) : (
              'Analyze Proof Structure'
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

export default ProofValidationFooter;
