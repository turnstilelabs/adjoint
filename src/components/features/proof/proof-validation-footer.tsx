import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { validateProofAction } from '@/app/actions';
import { ChevronDown, RefreshCw, AlertTriangle, AlertCircle } from 'lucide-react';

function ProofValidationFooter() {
  const { toast } = useToast();

  const problem = useAppStore((s) => s.problem!);
  const updateCurrentProofVersion = useAppStore((s) => s.updateCurrentProofVersion);
  const clearLastEditedStep = useAppStore((s) => s.clearLastEditedStep);

  const proof = useAppStore((s) => s.proof());

  const [, startValidateProof] = useTransition();

  const [, setCancelled] = useState(false);
  const cancelledRef = useRef(false);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [canShowCancelCue, setCanShowCancelCue] = useState(false);
  const cancelCueTimerRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const [isOpen, setIsOpen] = useState(true);
  const lastResultTsRef = useRef<number | null>(null);
  const isAnalyzed = !!proof.validationResult && !isRunning;

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

  // Auto-expand review when a fresh validation result arrives
  useEffect(() => {
    const ts = proof.validationResult?.timestamp
      ? new Date(proof.validationResult.timestamp).getTime()
      : null;
    if (ts && ts !== lastResultTsRef.current) {
      setIsOpen(true);
      lastResultTsRef.current = ts;
    }
  }, [proof.validationResult?.timestamp]);

  const handleValidateProof = () => {
    setCancelled(false);
    cancelledRef.current = false;
    setCanShowCancelCue(false);
    if (cancelCueTimerRef.current) {
      clearTimeout(cancelCueTimerRef.current);
      cancelCueTimerRef.current = null;
    }
    cancelCueTimerRef.current = window.setTimeout(() => setCanShowCancelCue(true), 900);
    const myRun = runIdRef.current + 1;
    runIdRef.current = myRun;
    setIsRunning(true);
    startValidateProof(async () => {
      updateCurrentProofVersion({ validationResult: undefined });

      const result = await validateProofAction(problem, proof.sublemmas);
      if (runIdRef.current !== myRun) {
        return;
      }

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
            // Never display model name in UI — keep for internal logs if needed.
            model: undefined as any,
          },
          // Whole-proof analysis doesn't invalidate step analyses, but we clear the CTA cue.
          lastEditedStepIdx: null,
        });
        clearLastEditedStep();
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
          title: 'System issue — validation couldn’t complete',
          description: friendly,
          variant: 'default',
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
    runIdRef.current += 1; // Invalidate any in-flight run
    setIsRunning(false);
    setCanShowCancelCue(false);
    if (cancelCueTimerRef.current) {
      clearTimeout(cancelCueTimerRef.current);
      cancelCueTimerRef.current = null;
    }
  };

  return (
    <>
      {/* Analyze proof structure button */}
      <div className="mt-4 flex items-center justify-end" aria-busy={isRunning}>
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
          className="group px-3"
          aria-busy={isRunning}
        >
          {isRunning ? (
            <span className="relative inline-flex items-center justify-center">
              {/* Running label with animated dots (visible by default) */}
              <span
                className={`flex items-center gap-2 transition-opacity duration-150 opacity-100 ${canShowCancelCue ? 'group-hover:opacity-0 group-focus-visible:opacity-0' : ''
                  }`}
              >
                <span aria-live="polite">Generating analysis</span>
                <span className="flex items-center gap-1" aria-hidden="true">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce"
                    style={{ animationDelay: '160ms' }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce"
                    style={{ animationDelay: '320ms' }}
                  />
                </span>
              </span>
              {/* Hover/focus label (Cancel) cross-fades in, same footprint */}
              <span
                className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-150 opacity-0 ${canShowCancelCue ? 'group-hover:opacity-100 group-focus-visible:opacity-100' : ''
                  }`}
              >
                Cancel
              </span>
            </span>
          ) : isAnalyzed ? (
            <span className="inline-flex items-center">
              <span>Proof Structure Analyzed</span>

              <span
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen((v) => !v);
                }}
                className="ml-1 inline-flex items-center rounded p-0.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={isOpen ? 'Hide review' : 'Show review'}
                title={isOpen ? 'Hide review' : 'Show review'}
                role="button"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-0' : 'rotate-180'}`}
                />
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center">
              <span>Analyze Proof Structure</span>
            </span>
          )}
        </Button>
        {isAnalyzed && !isRunning && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-2"
            onClick={handleValidateProof}
            aria-label="Run again"
            title="Run again"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Proof structure review card */}
      {proof.validationResult && (
        <div className="mt-3">
          <Accordion
            type="single"
            collapsible
            value={isOpen ? 'review' : undefined}
            onValueChange={(v) => setIsOpen(!!v)}
          >
            <AccordionItem value="review">
              <AccordionTrigger className="sr-only">Proof structure review</AccordionTrigger>
              <AccordionContent>
                <div ref={alertRef}>
                  <Alert variant="default">
                    {!proof.validationResult.isError && proof.validationResult.isValid === false && (
                      <>
                        <AlertTriangle className="h-4 w-4 text-primary" />
                        <AlertTitle className="text-xs text-foreground/90">Issues found</AlertTitle>
                      </>
                    )}
                    {proof.validationResult.isError && (
                      <>
                        <AlertCircle className="h-4 w-4 text-foreground" />
                        <AlertTitle className="text-xs text-foreground/90">
                          System issue — validation couldn’t complete
                        </AlertTitle>
                      </>
                    )}
                    <AlertDescription>
                      <div className="rounded-md border-l-2 pl-3 py-2 bg-muted/30 border-primary/50 text-sm font-mono text-foreground/90">
                        <KatexRenderer content={proof.validationResult.feedback} />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Automated analysis generated
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </>
  );
}

export default ProofValidationFooter;
