"use client";

import Link from 'next/link';
import * as React from 'react';
import { LogoSmall } from '@/components/logo-small';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/state/app-store';
import { BookOpen, Code2, Sparkles } from 'lucide-react';
import { EditableArtifactItem } from '@/components/explore/editable-artifact-item';

export function ExploreSidebar() {
    const artifacts = useAppStore((s) => s.exploreArtifacts);
    const edits = useAppStore((s) => s.exploreArtifactEdits);
    const setEdit = useAppStore((s) => s.setExploreArtifactEdit);
    const promoteToProof = useAppStore((s) => s.promoteToProof);

    const candidates = artifacts?.candidateStatements ?? [];

    const [openLiterature, setOpenLiterature] = React.useState(false);
    const [openCode, setOpenCode] = React.useState(false);
    const [openProve, setOpenProve] = React.useState(false);

    const [selectedIdx, setSelectedIdx] = React.useState<number>(0);

    // Reset selection when candidate list changes.
    React.useEffect(() => {
        setSelectedIdx((idx) => Math.min(Math.max(0, idx), Math.max(0, candidates.length - 1)));
    }, [candidates.length]);

    const attemptSelected = async () => {
        const original = (candidates[selectedIdx] ?? '').trim();
        const stmt = ((edits.candidateStatements[original] ?? original) ?? '').trim();
        if (!stmt) return;
        setOpenProve(false);
        await promoteToProof(stmt);
    };

    return (
        <TooltipProvider>
            <aside className="w-14 flex flex-col items-center py-4 border-r bg-card shrink-0">
                <Link href="/" className="mb-6 cursor-pointer" aria-label="Go to homepage">
                    <LogoSmall />
                </Link>

                <div className="flex flex-col items-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => setOpenLiterature(true)} aria-label="Literature search">
                                <BookOpen className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Literature search</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => setOpenCode(true)} aria-label="Code exploration">
                                <Code2 className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Code exploration</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => setOpenProve(true)} aria-label="Prove it">
                                <Sparkles className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Prove it</TooltipContent>
                    </Tooltip>
                </div>

                <div className="flex-1" />

                {/* Literature modal */}
                <Dialog open={openLiterature} onOpenChange={setOpenLiterature}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Literature search</DialogTitle>
                            <DialogDescription>Not implemented yet :)</DialogDescription>
                        </DialogHeader>
                    </DialogContent>
                </Dialog>

                {/* Code exploration modal */}
                <Dialog open={openCode} onOpenChange={setOpenCode}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Code exploration</DialogTitle>
                            <DialogDescription>Not implemented yet :)</DialogDescription>
                        </DialogHeader>
                    </DialogContent>
                </Dialog>

                {/* Prove it modal */}
                <Dialog open={openProve} onOpenChange={setOpenProve}>
                    <DialogContent className="sm:max-w-xl w-[90vw]">
                        <DialogHeader>
                            <DialogTitle>Prove it</DialogTitle>
                            <DialogDescription>
                                Pick a candidate statement, optionally edit it, then attempt a proof.
                            </DialogDescription>
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
                                                className={`px-3 py-2 text-sm border-b last:border-b-0 hover:bg-muted/40 ${active ? 'bg-muted/40' : ''}`}
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
                            <Button variant="secondary" onClick={() => setOpenProve(false)}>
                                Close
                            </Button>
                            <Button onClick={attemptSelected} disabled={!((candidates[selectedIdx] ?? '').trim())}>
                                Attempt Proof
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </aside>
        </TooltipProvider>
    );
}
