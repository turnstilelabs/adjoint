'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { EditableArtifactItem } from '@/components/explore/editable-artifact-item';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { splitStatements } from '@/lib/split-statements';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function AttemptProofChooser({
    open,
    onOpenChange,
    title = 'Attempt proof',
    description = 'Pick a candidate statement (optionally edit it), then attempt a proof.',
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    description?: string;
}) {
    const router = useRouter();
    const artifacts = useAppStore((s) => s.exploreArtifacts);
    const edits = useAppStore((s) => s.exploreArtifactEdits);
    const setEdit = useAppStore((s) => s.setExploreArtifactEdit);

    // Flatten multi-statement entries (if any) so the modal matches the right-panel carousel.
    const flatCandidates = React.useMemo(
        () => (artifacts?.candidateStatements ?? []).flatMap((s) => splitStatements(String(s ?? ''))).map((s) => s.trim()).filter(Boolean),
        [artifacts?.candidateStatements],
    );

    const [selectedIdx, setSelectedIdx] = React.useState<number>(0);
    const [manualStatement, setManualStatement] = React.useState<string>('');

    // Clamp selection when candidates change.
    React.useEffect(() => {
        setSelectedIdx((prev) => {
            if (!flatCandidates.length) return 0;
            return Math.max(0, Math.min(prev, flatCandidates.length - 1));
        });
    }, [flatCandidates.length]);

    // Clear manual statement when candidates appear (keeps the modal focused on the extracted list).
    React.useEffect(() => {
        if (flatCandidates.length > 0) setManualStatement('');
    }, [flatCandidates.length]);

    const attemptSelected = async () => {
        const stmt = flatCandidates.length
            ? (((edits.candidateStatements[(flatCandidates[selectedIdx] ?? '').trim()] ?? (flatCandidates[selectedIdx] ?? '')) ?? '').trim())
            : manualStatement.trim();

        if (!stmt) return;
        onOpenChange(false);
        router.push(`/prove?q=${encodeURIComponent(stmt)}`);
    };

    const count = flatCandidates.length;
    const go = (i: number) => {
        if (!count) return;
        setSelectedIdx(((i % count) + count) % count);
    };

    const original = (flatCandidates[selectedIdx] ?? '').trim();
    const display = (edits.candidateStatements[original] ?? original).trim();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl w-[90vw]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    {flatCandidates.length === 0 ? (
                        <div className="space-y-3">
                            <div className="text-sm text-muted-foreground">No candidate statements yet.</div>

                            <div className="space-y-2">
                                <Label htmlFor="manual-statement">Enter a statement to prove</Label>
                                <Textarea
                                    id="manual-statement"
                                    value={manualStatement}
                                    onChange={(e) => setManualStatement(e.target.value)}
                                    className="min-h-[110px]"
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="text-xs font-medium text-muted-foreground">Candidate statements</div>
                            <Card className="border-muted/50 overflow-hidden">
                                <CardContent className="p-3 space-y-3 overflow-hidden">
                                    <div className="text-sm break-words whitespace-pre-wrap overflow-hidden">
                                        <EditableArtifactItem
                                            value={display}
                                            onCommit={(next) =>
                                                setEdit({ kind: 'candidateStatements', original, edited: next })
                                            }
                                            className="px-0"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-muted-foreground">Statement {selectedIdx + 1}</div>

                                        <div className="flex items-center gap-1">
                                            <button
                                                aria-label="Previous statement"
                                                className="h-6 w-6 rounded-full border border-muted/50 text-xs flex items-center justify-center hover:bg-muted/30"
                                                onClick={() => go(selectedIdx - 1)}
                                            >
                                                ‹
                                            </button>
                                            <div className="flex gap-1">
                                                {flatCandidates.map((_, i) => (
                                                    <button
                                                        key={i}
                                                        aria-label={`Go to statement ${i + 1}`}
                                                        onClick={() => go(i)}
                                                        className={`h-2 w-2 rounded-full ${i === selectedIdx ? 'bg-primary' : 'bg-muted'}`}
                                                    />
                                                ))}
                                            </div>
                                            <button
                                                aria-label="Next statement"
                                                className="h-6 w-6 rounded-full border border-muted/50 text-xs flex items-center justify-center hover:bg-muted/30"
                                                onClick={() => go(selectedIdx + 1)}
                                            >
                                                ›
                                            </button>
                                            <div className="ml-2 text-xs text-muted-foreground">
                                                {selectedIdx + 1} / {count}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button
                        onClick={attemptSelected}
                        disabled={flatCandidates.length ? !((flatCandidates[selectedIdx] ?? '').trim()) : !manualStatement.trim()}
                    >
                        Attempt Proof
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
