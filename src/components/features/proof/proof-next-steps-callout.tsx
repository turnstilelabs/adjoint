'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/state/app-store';

type ActionId = 'structured' | 'graph' | 'chat' | 'analyze' | 'workspace';

const SESSION_KEY = 'adjoint.proof.nextStepsDismissed.v1';

const LABELS: Record<ActionId, string> = {
    structured: 'Structure it',
    graph: 'See the graph',
    chat: 'Ask questions',
    analyze: 'Analyze',
    workspace: 'Add to Workspace',
};

const DESCRIPTIONS: Record<ActionId, string> = {
    structured: 'Convert the raw proof into a step-by-step proof you can edit.',
    graph: 'Visualize dependencies between steps (requires a structured proof).',
    chat: 'Ask questions about any part of the proof.',
    analyze: 'Run an automated AI analysis on the current proof.',
    workspace: 'Send the current proof to Workspace to keep working on it.',
};

function emitSidebarHover(id: ActionId | null) {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(
            new CustomEvent('adjoint:proofSidebarHover', {
                detail: { id },
            }),
        );
    } catch {
        // ignore
    }
}

function clickSidebarAction(id: ActionId) {
    try {
        const el = document.querySelector(`[data-proof-action="${id}"]`) as HTMLElement | null;
        if (!el) return;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch {
        // ignore
    }
}

export function ProofNextStepsCallout({ className }: { className?: string }) {
    const { toast } = useToast();
    const rawProof = useAppStore((s) => s.rawProof);
    const viewMode = useAppStore((s) => s.viewMode);

    const [dismissed, setDismissed] = useState(false);
    const [active, setActive] = useState<ActionId | null>(null);

    // Per-session dismissal.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            setDismissed(window.sessionStorage.getItem(SESSION_KEY) === '1');
        } catch {
            setDismissed(false);
        }
    }, []);

    // Never leave sidebar highlighted.
    useEffect(() => {
        if (!active) return;
        return () => emitSidebarHover(null);
    }, [active]);

    const show = useMemo(() => {
        if (dismissed) return false;
        return (rawProof || '').trim().length > 0;
    }, [dismissed, rawProof]);

    if (!show) return null;

    const onHover = (id: ActionId) => {
        setActive(id);
        emitSidebarHover(id);
    };
    const onLeave = () => {
        setActive(null);
        emitSidebarHover(null);
    };

    const onClick = (id: ActionId) => {
        // Small UX nicety: if user clicks Graph but is still in raw mode,
        // we can still route them to the Graph action and let the existing sidebar
        // logic show its “Graph unavailable” toast.
        if (id === 'graph' && viewMode === 'raw') {
            toast({
                title: 'Tip',
                description: 'Graph requires a structured proof first.',
            });
        }
        clickSidebarAction(id);
    };

    return (
        <Card className={cn('border-border/70 bg-muted/20', className)}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">Where to go from here</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {active
                                ? DESCRIPTIONS[active]
                                : 'More tools are available in the left sidebar. Hover an action below to learn more.'}
                        </div>
                    </div>

                    <button
                        type="button"
                        aria-label="Dismiss"
                        className="-mr-1 inline-flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                        onClick={() => {
                            try {
                                window.sessionStorage.setItem(SESSION_KEY, '1');
                            } catch {
                                // ignore
                            }
                            setDismissed(true);
                            emitSidebarHover(null);
                        }}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    {(Object.keys(LABELS) as ActionId[]).map((id) => (
                        <span
                            key={id}
                            onMouseEnter={() => onHover(id)}
                            onMouseLeave={onLeave}
                        >
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onClick(id)}
                            >
                                {LABELS[id]}
                            </Button>
                        </span>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

