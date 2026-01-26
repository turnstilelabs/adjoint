'use client';

import ProofDisplay from '@/components/features/proof/proof-display';
import { useAppStore } from '@/state/app-store';
import { ProofLoading } from '@/components/features/proof/proof-loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RefreshCw, Pencil, Info } from 'lucide-react';
import { openFeedback } from '@/components/feedback/feedback-widget';
import { KatexRenderer } from '@/components/katex-renderer';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function ProofView() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const {
    loading,
    proof,
    problem,
    error,
    errorDetails,
    errorCode,
    retry,
    editProblem,
    pendingSuggestion,
    acceptSuggestedChange,
    clearSuggestion,
  } = useAppStore((s) => ({
    loading: s.loading,
    proof: s.proof,
    problem: s.problem,
    error: s.error,
    errorDetails: s.errorDetails,
    errorCode: s.errorCode,
    retry: s.retry,
    editProblem: s.editProblem,
    pendingSuggestion: s.pendingSuggestion,
    acceptSuggestedChange: s.acceptSuggestedChange,
    clearSuggestion: s.clearSuggestion,
  }));

  const hasProof = !!proof();
  const q = (searchParams?.get('q') || '').trim();

  // If the user lands on /prove without an active proof (e.g. after a cancel/reset),
  // redirect to home without flashing an intermediate empty state.
  useEffect(() => {
    // Only redirect away from /prove when there is no active proof AND no explicit query.
    // If `q` exists, ProveClientPage will start the proof attempt in an effect shortly.
    if (!q && !loading && !hasProof && !error && !pendingSuggestion) {
      router.replace('/');
    }
  }, [q, loading, hasProof, error, pendingSuggestion, router]);

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

  // If the model proved only a *variant*, we want to gate the proof UI behind
  // an explicit Accept/Retry decision (so the user sees the suggestion before
  // seeing the tentative proof content).
  if (!loading && pendingSuggestion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-3xl border-primary/40">
          <CardHeader>
            <CardTitle>Proposed Revision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {problem ? (
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs uppercase tracking-wide text-foreground/60">Original statement</div>
                <div className="mt-1">
                  <KatexRenderer content={problem} />
                </div>
              </div>
            ) : null}

            <div className="rounded-md border p-3">
              <div className="text-sm mb-2 font-medium">
                The AI was unable to prove this statement and proposed an alternative formulation:
              </div>
              <div className="rounded-md border bg-background p-2">
                <KatexRenderer content={pendingSuggestion.provedStatement} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={acceptSuggestedChange} autoFocus>
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={retry}>
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    clearSuggestion();
                    editProblem();
                  }}
                >
                  Edit
                </Button>
              </div>
              {pendingSuggestion.explanation ? (
                <div className="text-xs text-muted-foreground mt-2">{pendingSuggestion.explanation}</div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <ProofLoading />;
  }

  if (!hasProof) return null;

  return <ProofDisplay />;
}
