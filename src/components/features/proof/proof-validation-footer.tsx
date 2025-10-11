import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { useEffect, useRef, useTransition } from 'react';
import { isEqual } from 'lodash';
import { useToast } from '@/hooks/use-toast';

function ProofValidationFooter() {
  const { toast } = useToast();

  const proofValidationResult = useAppStore((s) => s.proofValidationResult);
  const lastReviewStatus = useAppStore((s) => s.lastReviewStatus);
  const lastReviewedAt = useAppStore((s) => s.lastReviewedAt);
  const sublemmas = useAppStore((s) => s.sublemmas);
  const problem = useAppStore((s) => s.problem);
  const isProofEdited = useAppStore((s) => s.isProofEdited);

  const setLastReviewedAt = useAppStore((s) => s.setLastReviewedAt);
  const setProofValidationResult = useAppStore((s) => s.setProofValidationResult);
  const setLastValidatedSublemmas = useAppStore((s) => s.setLastValidatedSublemmas);
  const setIsProofEdited = useAppStore((s) => s.setIsProofEdited);
  const setLastReviewStatus = useAppStore((s) => s.setLastReviewStatus);
  const setProofHistory = useAppStore((s) => s.setProofHistory);

  const activeVersionIndex = useAppStore((s) => s.activeVersionIndex);

  const [isProofValidating, startValidateProof] = useTransition();

  const abortControllerRef = useRef<AbortController | null>(null);
  // Abort in-flight validation if component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleValidateProof = () => {
    // Prevent re-running when nothing changed since last review
    if (
      !isProofEdited &&
      (lastReviewStatus === 'reviewed_ok' || lastReviewStatus === 'reviewed_issues')
    ) {
      return;
    }
    // If already validating, clicking acts as Abort
    if (isProofValidating) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    startValidateProof(async () => {
      setProofValidationResult(null);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const res = await fetch('/api/validate-proof', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            problem,
            proofSteps: sublemmas,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // If the client aborted, the fetch throws before reaching here in most browsers.
          // But handle non-2xx responses too.
          let message = 'Failed to validate the proof with AI.';
          try {
            const data = await res.json();
            if (data?.error) message = data.error;
          } catch {
            // ignore json parse error
          }
          throw new Error(message);
        }

        const result = await res.json();
        if ('isValid' in result && 'feedback' in result) {
          const validationResult = {
            isValid: result.isValid || false,
            feedback: result.feedback || 'No feedback provided.',
          };
          setProofValidationResult(validationResult);
          setLastValidatedSublemmas(sublemmas);
          setIsProofEdited(false);
          setLastReviewStatus(validationResult.isValid ? 'reviewed_ok' : 'reviewed_issues');
          setLastReviewedAt(new Date());

          setProofHistory((prev) => {
            const updatedHistory = [...prev];
            const activeVersion = updatedHistory[activeVersionIndex];
            if (activeVersion && isEqual(activeVersion.sublemmas, sublemmas)) {
              activeVersion.isValid = validationResult.isValid;
            }
            return updatedHistory;
          });
        } else {
          toast({
            title: 'Validation Failed',
            description: 'An unexpected error occurred during validation.',
            variant: 'destructive',
          });
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          // Swallow; user intentionally aborted
        } else {
          setLastReviewStatus('error');
          toast({
            title: 'Validation Failed',
            description: error?.message || 'An unexpected error occurred during validation.',
            variant: 'destructive',
          });
        }
      } finally {
        abortControllerRef.current = null;
      }
    });
  };

  const handleAbortValidation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <>
      <div className="pt-4 space-y-4">
        {proofValidationResult && (
          <Alert
            variant={proofValidationResult.isValid ? 'default' : 'destructive'}
            className="bg-card"
          >
            {proofValidationResult.isValid ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertTitle>
              {proofValidationResult.isValid ? 'Reviewed by AI' : 'AI found issues'}
            </AlertTitle>
            <AlertDescription>
              <KatexRenderer content={proofValidationResult.feedback} />
              <div className="mt-2 text-xs text-muted-foreground">
                {proofValidationResult.isValid
                  ? 'Assessed by AI'
                  : 'Flagged by AI; please double-check.'}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
      <div className="sticky bottom-0 left-0 right-0 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto p-3 flex items-center justify-between gap-3">
          <div className="flex items-center text-sm text-muted-foreground">
            {lastReviewStatus === 'ready' && (
              <>
                <Info className="mr-2 h-4 w-4" />
                <span>Ready for AI review</span>
              </>
            )}
            {lastReviewStatus === 'reviewed_ok' && (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                <span>Reviewed by AI</span>
                {lastReviewedAt && (
                  <span className="ml-2 text-xs">• {lastReviewedAt.toLocaleTimeString()}</span>
                )}
              </>
            )}
            {lastReviewStatus === 'reviewed_issues' && (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                <span>AI found issues</span>
              </>
            )}
            {lastReviewStatus === 'error' && (
              <>
                <AlertTriangle className="mr-2 h-4 w-4" />
                <span>Couldn’t review</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isProofValidating && (
              <Button variant="outline" size="sm" onClick={handleAbortValidation}>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
            <Button
              onClick={handleValidateProof}
              disabled={
                isProofValidating ||
                sublemmas.length === 0 ||
                (!isProofEdited &&
                  (lastReviewStatus === 'reviewed_ok' || lastReviewStatus === 'reviewed_issues'))
              }
            >
              {isProofValidating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reviewing…
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Run AI review
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export default ProofValidationFooter;
