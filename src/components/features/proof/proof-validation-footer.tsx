import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { validateProofAction, validateRawProofAction } from '@/app/actions';
import { ChevronDown, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

function hashString(input: string): string {
  try {
    // Fast, deterministic hash good enough for de-duping UI actions
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = (h * 31 + input.charCodeAt(i)) | 0;
    }
    return `h${h}`;
  } catch {
    return 'h0';
  }
}

function ProofValidationFooter() {
  const { toast } = useToast();

  const problem = useAppStore((s) => s.problem!);
  const updateCurrentProofMeta = useAppStore((s) => s.updateCurrentProofMeta);
  const clearLastEditedStep = useAppStore((s) => s.clearLastEditedStep);
  const viewMode = useAppStore((s) => s.viewMode);
  const rawProof = useAppStore((s) => s.rawProof);

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

  const isRawMode = viewMode === 'raw' || proof.type === 'raw';

  const computeSourceHash = () => {
    if (isRawMode) {
      return hashString((rawProof || '').trim());
    }
    // Structured: include all step content. Keep stable ordering.
    const steps = (proof.sublemmas || []).map((s) => ({ title: s.title, statement: s.statement, proof: s.proof }));
    return hashString(JSON.stringify(steps));
  };

  const currentSourceHash = computeSourceHash();
  const lastSourceHash = proof.validationResult?.sourceHash;
  const lastSourceType = proof.validationResult?.sourceType;
  const canRunAnalysis = isRawMode
    ? Boolean((rawProof || '').trim()) && (lastSourceType !== 'raw' || lastSourceHash !== currentSourceHash)
    : proof.sublemmas.length > 0 && (lastSourceType !== 'structured' || lastSourceHash !== currentSourceHash);

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
    if (!canRunAnalysis) return;

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
      // Clear existing result in-place so the UI can reflect that a fresh run is in progress.
      updateCurrentProofMeta({ validationResult: undefined });

      const result = isRawMode
        ? await validateRawProofAction(problem, rawProof)
        : await validateProofAction(problem, proof.sublemmas);
      if (runIdRef.current !== myRun) {
        return;
      }

      if (cancelledRef.current) {
        return;
      }

      if (result.success) {
        updateCurrentProofMeta({
          validationResult: {
            isValid: result.isValid || false,
            isError: false,
            feedback: result.feedback || 'No feedback provided.',
            timestamp: new Date(),
            // Never display model name in UI — keep for internal logs if needed.
            model: undefined as any,
            sourceType: isRawMode ? 'raw' : 'structured',
            sourceHash: currentSourceHash,
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
        updateCurrentProofMeta({
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
          disabled={!isRunning && !canRunAnalysis}
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
              <span>{isRawMode ? 'Proof Analyzed' : 'Proof Structure Analyzed'}</span>

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
              <span>{isRawMode ? 'Analyze Proof' : 'Analyze Proof Structure'}</span>
            </span>
          )}
        </Button>
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
                    {!proof.validationResult.isError && proof.validationResult.isValid === true && (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertTitle className="text-xs text-foreground/90">
                          Looks consistent
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
