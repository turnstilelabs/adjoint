import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { useEffect, useRef, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';

function ProofValidationFooter() {
  const { toast } = useToast();

  const problem = useAppStore((s) => s.problem);
  const updateCurrentProofVersion = useAppStore((s) => s.updateCurrentProofVersion);

  const proof = useAppStore((s) => s.proof());

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
    startValidateProof(async () => {
      updateCurrentProofVersion({ validationResult: undefined });
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        // TODO go back to using regular action for consistency, use Promise.race like this to handle
        // cancellation
        /**
         *     const cancelPromise = new Promise<never>((_, reject) => {
         *         cancelRef.current = () => reject(new Error("canceled"));
         *       });
         *
         *    const data = (await Promise.race([
         *           slowServerAction(), // your real server action call
         *           cancelPromise,
         *         ])) as Result;
         *
         *         finally {
         *         // clear cancel hook; transition has settled -> isPending becomes false
         *         cancelRef.current = null;
         *       }
         *
         *        const cancel = () => {
         *     // cause the race to reject now -> transition settles -> isPending false
         *     cancelRef.current?.();
         *   };
         */
        const res = await fetch('/api/validate-proof', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            problem,
            proofSteps: proof.sublemmas,
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
          updateCurrentProofVersion({
            validationResult: {
              isValid: result.isValid || false,
              isError: false,
              feedback: result.feedback || 'No feedback provided.',
              timestamp: new Date(),
            },
          });
        } else {
          updateCurrentProofVersion({
            validationResult: {
              isError: true,
              timestamp: new Date(),
              feedback: 'Malformed result',
            },
          });
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
          updateCurrentProofVersion({
            validationResult: {
              isError: true,
              timestamp: new Date(),
              feedback: error?.message || 'An unexpected error occurred during validation.',
            },
          });
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
        {proof.validationResult && (
          <Alert
            variant={proof.validationResult.isValid ? 'default' : 'destructive'}
            className="bg-card"
          >
            {proof.validationResult.isValid ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertTitle>
              {proof.validationResult.isValid ? 'Reviewed by AI' : 'AI found issues'}
            </AlertTitle>
            <AlertDescription>
              <KatexRenderer content={proof.validationResult.feedback} />
              <div className="mt-2 text-xs text-muted-foreground">
                {proof.validationResult.isValid
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
            {!proof.validationResult && (
              <>
                <Info className="mr-2 h-4 w-4" />
                <span>Ready for AI review</span>
              </>
            )}
            {proof.validationResult?.isValid === true && (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                <span>Reviewed by AI</span>
                {proof.validationResult.timestamp && (
                  <span className="ml-2 text-xs">
                    • {proof.validationResult.timestamp.toLocaleTimeString()}
                  </span>
                )}
              </>
            )}
            {proof.validationResult?.isValid === false && (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                <span>AI found issues</span>
              </>
            )}
            {proof.validationResult?.isError === true && (
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
                proof.sublemmas.length === 0 ||
                (proof.validationResult && !proof.validationResult.isError)
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
