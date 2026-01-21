'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KatexRenderer } from '@/components/katex-renderer';
import { useToast } from '@/hooks/use-toast';
import { convertSelectionToSympySpecAction } from '@/app/actions';
import { useSympyWorker, type SymPyResult, type SymPySpec } from '@/hooks/useSympyWorker';
import { fallbackSelectionToSympySpec } from '@/lib/sympy/fallback-spec';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2, PlusSquare } from 'lucide-react';
import { useAppStore } from '@/state/app-store';

type VerifyDialogInput = {
    selectionLatex: string;
    selectionText: string;
};

function truthBadgeVariant(truth: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (truth === 'true') return 'default';
    if (truth === 'false') return 'destructive';
    if (truth === 'unknown') return 'secondary';
    return 'outline';
}

function truthLabel(truth: string | undefined) {
    if (truth === 'true') return 'True';
    if (truth === 'false') return 'False';
    if (truth === 'unknown') return 'Unknown';
    return '—';
}

export function VerifyDialogController() {
    const { toast } = useToast();
    const { preload, run } = useSympyWorker();
    const goToWorkspace = useAppStore((s) => s.goToWorkspace);

    const [open, setOpen] = useState(false);
    const [input, setInput] = useState<VerifyDialogInput | null>(null);
    const [phase, setPhase] = useState<'idle' | 'converting' | 'running' | 'done' | 'error'>('idle');
    const [spec, setSpec] = useState<SymPySpec | null>(null);
    const [result, setResult] = useState<SymPyResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    useEffect(() => {
        const onVerify = (evt: any) => {
            const detail = evt?.detail || {};
            const selectionLatex = String(detail.selectionLatex ?? '').trim();
            const selectionText = String(detail.selectionText ?? '').trim();
            if (!selectionLatex && !selectionText) return;

            setInput({ selectionLatex, selectionText });
            setOpen(true);

            // Reset state for new run.
            setPhase('idle');
            setSpec(null);
            setResult(null);
            setError(null);
            setDetailsOpen(false);

            // Start preloading in the background.
            try {
                void preload();
            } catch {
                // ignore
            }
        };

        window.addEventListener('adjoint:sympyVerify', onVerify as any);
        return () => window.removeEventListener('adjoint:sympyVerify', onVerify as any);
    }, [preload]);

    const title = useMemo(() => {
        if (phase === 'running') return 'Verifying with SymPy…';
        if (phase === 'converting') return 'Preparing SymPy query…';
        return 'SymPy Verification';
    }, [phase]);

    const statusLine = useMemo(() => {
        if (phase === 'converting') return 'Interpreting selection…';
        if (phase === 'running') return 'Computing…';
        if (phase === 'error') return 'Failed.';
        return null;
    }, [phase]);

    const runNow = async () => {
        if (!input) return;

        setPhase('converting');
        setError(null);
        setResult(null);
        setSpec(null);

        // Always run a cheap offline heuristic first; if it detects an ODE, prefer it.
        const offlineHint = fallbackSelectionToSympySpec({
            selectionLatex: input.selectionLatex,
            selectionText: input.selectionText,
        });
        if (offlineHint && (offlineHint as any).op === 'dsolve') {
            setSpec(offlineHint);
            setPhase('running');
            const res = await run(offlineHint, { timeoutMs: 25_000 });
            setResult(res);
            if (res.ok) setPhase('done');
            else {
                setPhase('error');
                setError(res.error);
                toast({ title: 'SymPy error', description: res.error, variant: 'destructive' });
            }
            return;
        }

        let s: SymPySpec | null = null;
        const conv = await convertSelectionToSympySpecAction({
            selectionLatex: input.selectionLatex,
            selectionText: input.selectionText,
        });

        if (conv && (conv as any).success) {
            s = (conv as any).spec as SymPySpec;
        } else {
            // LLM unavailable or failed: try offline fallback for common cases.
            const fallback = fallbackSelectionToSympySpec({
                selectionLatex: input.selectionLatex,
                selectionText: input.selectionText,
            });
            if (fallback) {
                s = fallback;
                toast({
                    title: 'Using offline fallback',
                    description: 'Could not reach the model; attempting a best-effort SymPy parse locally.',
                    variant: 'default',
                });
            } else {
                const msg = (conv as any)?.error || 'Failed to convert selection into a SymPy query.';
                setPhase('error');
                setError(msg);
                toast({ title: 'Verify failed', description: msg, variant: 'destructive' });
                return;
            }
        }

        if (!s) {
            const msg = 'Failed to convert selection into a SymPy query.';
            setPhase('error');
            setError(msg);
            toast({ title: 'Verify failed', description: msg, variant: 'destructive' });
            return;
        }
        setSpec(s);

        setPhase('running');
        const res = await run(s, { timeoutMs: 25_000 });
        setResult(res);
        if (res.ok) {
            setPhase('done');
        } else {
            setPhase('error');
            setError(res.error);
            toast({ title: 'SymPy error', description: res.error, variant: 'destructive' });
        }
    };

    const interpretedBlock = useMemo(() => {
        if (!spec) return null;
        return (
            <div className="rounded-md border p-3 text-xs font-mono bg-muted/20 whitespace-pre-wrap">
                {JSON.stringify(spec, null, 2)}
            </div>
        );
    }, [spec]);

    const addToWorkspace = useCallback(() => {
        if (!result || !result.ok) return;
        const latex = String(result.result_latex || '').trim();
        const text = String(result.result_text || '').trim();

        // Prefer TeX block so Workspace preview renders it.
        const block = [
            '% (SymPy verification)',
            text ? `% ${text.replace(/\r?\n/g, ' ')}` : null,
            latex ? `\\[\n${latex}\n\\]` : null,
        ]
            .filter(Boolean)
            .join('\n');

        goToWorkspace({ append: block });
        toast({ title: 'Added to Workspace', description: 'Inserted SymPy result into Workspace.' });
    }, [goToWorkspace, result, toast]);

    const resultBlock = useMemo(() => {
        if (!result) return null;
        if (!result.ok) {
            return <div className="text-sm text-destructive">{result.error}</div>;
        }

        const truth = (result.meta as any)?.truth as any;
        const diffLatex = (result.meta as any)?.difference_latex as any;

        return (
            <div className="space-y-3">
                {result.op === 'verify' && (
                    <div className="flex items-center gap-2">
                        <Badge variant={truthBadgeVariant(truth)}>{truthLabel(truth)}</Badge>
                        <div className="text-xs text-muted-foreground">(based on simplifying lhs − rhs)</div>
                    </div>
                )}

                <div className="rounded-md border p-3 bg-background">
                    <KatexRenderer content={`$${result.result_latex}$`} autoWrap={false} />
                </div>

                {result.op === 'verify' && typeof diffLatex === 'string' && diffLatex.trim() && (
                    <div className="rounded-md border p-3 bg-background">
                        <div className="text-xs text-muted-foreground mb-2">Simplified difference</div>
                        <KatexRenderer content={`$${diffLatex}$`} autoWrap={false} />
                    </div>
                )}
            </div>
        );
    }, [result]);

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (!v) {
                    setInput(null);
                    setSpec(null);
                    setResult(null);
                    setError(null);
                    setPhase('idle');
                }
            }}
        >
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Convert the highlighted selection into a SymPy query and compute a result.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-md border p-3 bg-background">
                        <KatexRenderer content={input?.selectionLatex || input?.selectionText || ''} autoWrap={false} />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                            {(phase === 'converting' || phase === 'running') && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            )}
                            {statusLine ? <span>{statusLine}</span> : null}
                        </div>
                        {phase !== 'done' && (
                            <Button
                                onClick={runNow}
                                disabled={!input || phase === 'converting' || phase === 'running'}
                            >
                                {phase === 'converting'
                                    ? 'Interpreting…'
                                    : phase === 'running'
                                        ? 'Computing…'
                                        : 'Run'}
                            </Button>
                        )}
                    </div>

                    {error && <div className="text-sm text-destructive">{error}</div>}

                    {result && result.ok && (
                        <div className="text-xs text-muted-foreground">Results</div>
                    )}

                    {resultBlock}

                    {(spec || (result && result.ok)) && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                                    <CollapsibleTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 justify-start gap-1"
                                        >
                                            <span className="text-xs text-muted-foreground">Details</span>
                                            <ChevronDown
                                                className={`h-4 w-4 transition-transform ${detailsOpen ? '' : '-rotate-90'}`}
                                            />
                                        </Button>
                                    </CollapsibleTrigger>
                                </Collapsible>

                                {result && result.ok && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={addToWorkspace}
                                        title="Add this result to Workspace"
                                    >
                                        <PlusSquare className="h-4 w-4 mr-2" />
                                        Add to workspace
                                    </Button>
                                )}
                            </div>

                            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                                <CollapsibleContent className="space-y-2">
                                    {spec && (
                                        <div className="space-y-1">
                                            <div className="text-xs text-muted-foreground">Spec (JSON)</div>
                                            {interpretedBlock}
                                        </div>
                                    )}

                                    {result && result.ok && (
                                        <div className="space-y-1">
                                            <div className="text-xs text-muted-foreground">SymPy output (text)</div>
                                            <div className="rounded-md border p-3 text-xs font-mono bg-muted/20 whitespace-pre-wrap">
                                                {String(result.result_text || '').trim()}
                                            </div>
                                        </div>
                                    )}
                                </CollapsibleContent>
                            </Collapsible>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
