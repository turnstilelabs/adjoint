'use client';

import ProofDisplay from '@/components/features/proof/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/features/proof/proof-loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RefreshCw, Pencil, Info } from 'lucide-react';
import { openFeedback } from '@/components/feedback/feedback-widget';

export default function ProofView() {
  const deriveErrorTitle = (code?: string | null, msg?: string | null) => {
    switch (code) {
      case 'MODEL_AUTH_INVALID': return 'Model credentials issue';
      case 'MODEL_RATE_LIMIT': return 'Model at capacity';
      case 'MODEL_TIMEOUT': return 'Request timed out';
      case 'MODEL_STREAM_INTERRUPTED': return 'Streaming interrupted';
      case 'CONTEXT_WINDOW_EXCEEDED': return 'Context window exceeded';
      case 'MODEL_OUTPUT_UNPARSABLE': return 'Model output issue';
      default:
        if (!msg) return 'Something went wrong';
        const t = msg.toLowerCase();
        if (/(credential|api key|unauthorized|forbidden)/.test(t)) return 'Model credentials issue';
        if (/(rate|capacity|too many requests|overloaded)/.test(t)) return 'Model at capacity';
        if (/(timeout|timed out|took too long)/.test(t)) return 'Request timed out';
        if (/(stream|connection|interrupted|network)/.test(t)) return 'Streaming interrupted';
        if (/(context window|token limit|max tokens)/.test(t)) return 'Context window exceeded';
        if (/(parse|json|structured output)/.test(t)) return 'Model output issue';
        return 'Something went wrong';
    }
  };
  const { loading, proof, startProof, problem, error, errorDetails, errorCode, retry, editProblem } =
    useAppStore((s) => ({
      loading: s.loading,
      proof: s.proof,
      startProof: s.startProof,
      problem: s.problem,
      error: s.error,
      errorDetails: s.errorDetails,
      errorCode: s.errorCode,
      retry: s.retry,
      editProblem: s.editProblem,
    }));

  if (!loading && error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>{deriveErrorTitle(errorCode, error)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex gap-2">
                <Button onClick={retry}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button variant="secondary" onClick={editProblem}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                {errorDetails && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Info className="mr-2 h-4 w-4" />
                        View error details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl w-[90vw]">
                      <DialogHeader>
                        <DialogTitle>Technical details</DialogTitle>
                        <DialogDescription>This is the raw error from the model’s provider:</DialogDescription>
                      </DialogHeader>
                      <div className="max-h-[50vh] overflow-auto">
                        <pre className="whitespace-pre-wrap break-words text-xs bg-muted p-3 rounded w-full max-w-full overflow-x-auto font-mono">{errorDetails}</pre>
                      </div>
                      <div className="pt-3">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            try {
                              const title = deriveErrorTitle(errorCode, error);
                              const payloadLines = [
                                `Error code: ${errorCode ?? 'n/a'}`,
                                `Title: ${title}`,
                                `Message: ${error ?? 'n/a'}`,
                                '',
                                'Details:',
                                errorDetails ?? 'n/a',
                              ];
                              openFeedback({
                                tag: 'error-report',
                                source: 'error-dialog',
                                comment: payloadLines.join('\n'),
                              });
                            } catch { }
                          }}
                        >
                          Send to Adjoint support
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <ProofLoading />;
  }

  if (!proof()) {
    // With the new split-phase pipeline, we can temporarily have no structured proof
    // (we still want to render the proof view so the user can edit raw proof).
    // A minimal placeholder version will be created in the store when the draft completes.
    return <ProofLoading />;
  }

  return <ProofDisplay />;
}
