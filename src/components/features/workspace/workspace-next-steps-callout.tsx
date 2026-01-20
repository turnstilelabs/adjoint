'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

type ActionId = 'import' | 'chat' | 'preview' | 'review' | 'export';

const SESSION_KEY = 'adjoint.workspace.nextStepsDismissed.v1';

const LABELS: Record<ActionId, string> = {
    import: 'Import',
    chat: 'Chat',
    preview: 'Preview',
    review: 'Review',
    export: 'Export',
};

const DESCRIPTIONS: Record<ActionId, string> = {
    import: 'Import a .tex file (or plain text) into the editor.',
    chat: 'Ask questions about your draft or a selected excerpt.',
    preview: 'See a KaTeX preview of your current document.',
    review: 'Extract theorem-like artifacts and ask the AI to review their proofs.',
    export: 'Download your current document as a .tex file.',
};

function emitSidebarHover(id: ActionId | null) {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(
            new CustomEvent('adjoint:workspaceSidebarHover', {
                detail: { id },
            }),
        );
    } catch {
        // ignore
    }
}

function clickSidebarAction(id: ActionId) {
    try {
        const el = document.querySelector(`[data-workspace-action="${id}"]`) as HTMLElement | null;
        if (!el) return;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch {
        // ignore
    }
}

export function WorkspaceNextStepsCallout({ className }: { className?: string }) {
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

    const show = useMemo(() => !dismissed, [dismissed]);
    if (!show) return null;

    const onHover = (id: ActionId) => {
        setActive(id);
        emitSidebarHover(id);
    };
    const onLeave = () => {
        setActive(null);
        emitSidebarHover(null);
    };

    return (
        <Card className={cn('border-border/70 bg-muted/20', className)}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">Getting started in Workspace</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {active
                                ? DESCRIPTIONS[active]
                                : 'Use the left sidebar to import/export, chat with the assistant, preview the document, or review artifacts.'}
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
                        <span key={id} onMouseEnter={() => onHover(id)} onMouseLeave={onLeave}>
                            <Button size="sm" variant="outline" onClick={() => clickSidebarAction(id)}>
                                {LABELS[id]}
                            </Button>
                        </span>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
