import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { useRef, useState, useTransition } from 'react';
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

  const handleValidateProof = () => {
    setCancelled(false);
    cancelledRef.current = false;
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
          },
        });
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
      }
    });
  };

  const cancel = () => {
    setCancelled(true);
    cancelledRef.current = true;
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
            {isProofValidating && !cancelled && (
              <Button variant="outline" size="sm" onClick={cancel}>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
            <Button
              onClick={handleValidateProof}
              disabled={
                (isProofValidating && !cancelled) ||
                proof.sublemmas.length === 0 ||
                (proof.validationResult && !proof.validationResult.isError)
              }
            >
              {isProofValidating && !cancelled ? (
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
