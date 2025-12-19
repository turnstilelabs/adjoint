'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/state/app-store';
import { EditableArtifactItem } from '@/components/explore/editable-artifact-item';

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
    const artifacts = useAppStore((s) => s.exploreArtifacts);
    const edits = useAppStore((s) => s.exploreArtifactEdits);
    const setEdit = useAppStore((s) => s.setExploreArtifactEdit);
    const promoteToProof = useAppStore((s) => s.promoteToProof);

    const candidates = artifacts?.candidateStatements ?? [];
    const [selectedIdx, setSelectedIdx] = React.useState<number>(0);

    // Clamp selection when candidates change.
    React.useEffect(() => {
        setSelectedIdx((idx) => Math.min(Math.max(0, idx), Math.max(0, candidates.length - 1)));
    }, [candidates.length]);

    const attemptSelected = async () => {
        const original = (candidates[selectedIdx] ?? '').trim();
        const stmt = ((edits.candidateStatements[original] ?? original) ?? '').trim();
        if (!stmt) return;
        onOpenChange(false);
        await promoteToProof(stmt);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl w-[90vw]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Candidate statements</div>
                    {candidates.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No candidate statements yet.</div>
                    ) : (
                        <div className="max-h-72 overflow-auto border rounded-md">
                            {candidates.map((c, idx) => {
                                const active = idx === selectedIdx;
                                const original = (c ?? '').trim();
                                const display = (edits.candidateStatements[original] ?? original).trim();

                                return (
                                    <div
                                        key={idx}
                                        className={`px-3 py-2 text-sm border-b last:border-b-0 hover:bg-muted/40 ${active ? 'bg-muted/40' : ''
                                            }`}
                                        onClick={() => setSelectedIdx(idx)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <EditableArtifactItem
                                            value={display}
                                            onCommit={(next) =>
                                                setEdit({ kind: 'candidateStatements', original, edited: next })
                                            }
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button onClick={attemptSelected} disabled={!((candidates[selectedIdx] ?? '').trim())}>
                        Attempt Proof
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
