"use client";

import Link from 'next/link';
import * as React from 'react';
import { LogoSmall } from '@/components/logo-small';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/state/app-store';
import { BookOpen, Code2, Sparkles } from 'lucide-react';
import { KatexRenderer } from '@/components/katex-renderer';

export function ExploreSidebar() {
    const artifacts = useAppStore((s) => s.exploreArtifacts);
    const promoteToProof = useAppStore((s) => s.promoteToProof);

    const candidates = artifacts?.candidateStatements ?? [];

    const [openLiterature, setOpenLiterature] = React.useState(false);
    const [openCode, setOpenCode] = React.useState(false);
    const [openProve, setOpenProve] = React.useState(false);

    const [selectedIdx, setSelectedIdx] = React.useState<number>(0);

    const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
    const [editDraft, setEditDraft] = React.useState<string>('');
    const [editsByIdx, setEditsByIdx] = React.useState<Record<number, string>>({});

    // Reset selection when candidate list changes.
    React.useEffect(() => {
        setSelectedIdx((idx) => Math.min(Math.max(0, idx), Math.max(0, candidates.length - 1)));
        setEditsByIdx({});
        if (editingIdx != null && editingIdx >= candidates.length) {
            setEditingIdx(null);
            setEditDraft('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candidates.length]);

    const stopEditing = (opts?: { commit?: boolean }) => {
        const shouldCommit = opts?.commit ?? false;
        if (editingIdx == null) return;

        if (shouldCommit) {
            const stmt = editDraft.trim();
            if (stmt) {
                setEditsByIdx((prev) => ({ ...prev, [editingIdx]: stmt }));
                // Keep the edited statement as the active selection for the footer "Attempt Proof" button.
                setSelectedIdx(editingIdx);
            }
        }

        setEditingIdx(null);
        setEditDraft('');
    };

    const attemptSelected = async () => {
        const stmt = (
            editingIdx != null
                ? editDraft
                : (editsByIdx[selectedIdx] ?? candidates[selectedIdx] ?? '')
        ).trim();
        if (!stmt) return;
        setOpenProve(false);
        setEditingIdx(null);
        setEditDraft('');
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
                                        const isEditing = editingIdx === idx;
                                        const display = editsByIdx[idx] ?? c;

                                        return (
                                            <div
                                                key={idx}
                                                className={`relative min-h-11 text-sm border-b last:border-b-0 hover:bg-muted/40 ${active ? 'bg-muted/40' : ''}`}
                                                onClick={() => setSelectedIdx(idx)}
                                                onDoubleClick={() => {
                                                    setSelectedIdx(idx);
                                                    setEditingIdx(idx);
                                                    setEditDraft(editsByIdx[idx] ?? c);
                                                }}
                                                role="button"
                                                tabIndex={0}
                                            >
                                                {/* Layout box: always render the statement (invisible while editing) so height stays identical */}
                                                <div className={`px-3 py-2 break-words whitespace-pre-wrap ${isEditing ? 'opacity-0' : ''}`}>
                                                    <KatexRenderer content={display} />
                                                </div>

                                                {isEditing && (
                                                    <textarea
                                                        className="absolute inset-0 w-full h-full bg-transparent px-3 py-2 text-sm leading-relaxed outline-none resize-none overflow-hidden"
                                                        autoFocus
                                                        value={editDraft}
                                                        onChange={(e) => setEditDraft(e.target.value)}
                                                        onBlur={() => stopEditing({ commit: true })}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                stopEditing({ commit: true });
                                                            }
                                                            if (e.key === 'Escape') {
                                                                e.preventDefault();
                                                                stopEditing({ commit: false });
                                                            }
                                                        }}
                                                    />
                                                )}
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
