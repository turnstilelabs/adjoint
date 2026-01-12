"use client";

import Link from 'next/link';
import * as React from 'react';
import { useAppStore } from '@/state/app-store';
import { LogoSmall } from '@/components/logo-small';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AttemptProofChooser } from '@/components/explore/attempt-proof-chooser';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BookOpen, Code2, Sparkles, Plus } from 'lucide-react';
import { ConfirmResetDialog } from '@/components/confirm-reset-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { splitStatements } from '@/lib/split-statements';

export function ExploreSidebar() {
    const [openLiterature, setOpenLiterature] = React.useState(false);
    const [openCode, setOpenCode] = React.useState(false);
    const [openProve, setOpenProve] = React.useState(false);
    const [openResetConfirm, setOpenResetConfirm] = React.useState(false);
    const [openAddToWorkspace, setOpenAddToWorkspace] = React.useState(false);

    const reset = useAppStore((s) => s.reset);
    const goToWorkspace = useAppStore((s) => s.goToWorkspace);
    const artifacts = useAppStore((s) => s.exploreArtifacts);
    const edits = useAppStore((s) => s.exploreArtifactEdits);

    const options = React.useMemo(() => {
        const list = artifacts?.candidateStatements ?? [];
        const out: { key: string; text: string }[] = [];
        for (const original of list) {
            const base = String(original ?? '').trim();
            if (!base) continue;
            const edited = String(edits?.candidateStatements?.[base] ?? base).trim();
            const split = splitStatements(edited);
            // If splitStatements returns nothing (shouldn't), keep edited.
            const pieces = split.length ? split : [edited];
            for (let i = 0; i < pieces.length; i++) {
                const text = String(pieces[i] ?? '').trim();
                if (!text) continue;
                out.push({ key: `${base}::${i}`, text });
            }
        }
        return out;
    }, [artifacts, edits]);

    const [selected, setSelected] = React.useState<Record<string, boolean>>({});

    // When opening modal, default-select all available options.
    React.useEffect(() => {
        if (!openAddToWorkspace) return;
        const next: Record<string, boolean> = {};
        for (const o of options) next[o.key] = true;
        setSelected(next);
    }, [openAddToWorkspace, options]);

    const onConfirmAddToWorkspace = () => {
        const chosen = options.filter((o) => selected[o.key]).map((o) => o.text.trim()).filter(Boolean);
        if (!chosen.length) {
            setOpenAddToWorkspace(false);
            return;
        }

        const snippet = [
            '% --- Imported from Explore mode ---',
            ...chosen.flatMap((s) => [s, '']),
        ].join('\n').trim();

        goToWorkspace({ from: 'explore', append: snippet });
        setOpenAddToWorkspace(false);
    };

    return (
        <TooltipProvider>
            <aside className="w-14 flex flex-col items-center py-4 border-r bg-card shrink-0">
                <Link
                    href="/"
                    onClick={(e) => {
                        e.preventDefault();
                        setOpenResetConfirm(true);
                    }}
                    className="mb-6 cursor-pointer"
                    aria-label="Go to homepage"
                >
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

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setOpenAddToWorkspace(true)}
                                aria-label="Add to workspace"
                                disabled={options.length === 0}
                            >
                                <Plus className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Add to Workspace</TooltipContent>
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
                <AttemptProofChooser
                    open={openProve}
                    onOpenChange={setOpenProve}
                    title="Prove it"
                    description="Pick a candidate statement, optionally edit it, then attempt a proof."
                />

                {/* Add to workspace modal */}
                <Dialog open={openAddToWorkspace} onOpenChange={setOpenAddToWorkspace}>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>Add candidate statements to Workspace</DialogTitle>
                            <DialogDescription>
                                Select which statement(s) to append to your workspace draft.
                            </DialogDescription>
                        </DialogHeader>

                        {options.length === 0 ? (
                            <div className="text-sm text-muted-foreground">No candidate statements available.</div>
                        ) : (
                            <ScrollArea className="max-h-[45vh] pr-4">
                                <div className="space-y-3">
                                    {options.map((o) => (
                                        <div key={o.key} className="flex items-start gap-3 rounded-md border p-3">
                                            <Checkbox
                                                checked={Boolean(selected[o.key])}
                                                onCheckedChange={(v) =>
                                                    setSelected((prev) => ({ ...prev, [o.key]: Boolean(v) }))
                                                }
                                                id={`ws-${o.key}`}
                                            />
                                            <div className="space-y-1 min-w-0">
                                                <Label htmlFor={`ws-${o.key}`} className="text-sm font-medium">
                                                    Candidate statement
                                                </Label>
                                                <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                                    {o.text}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}

                        <div className="pt-2 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setOpenAddToWorkspace(false)}>
                                Cancel
                            </Button>
                            <Button onClick={onConfirmAddToWorkspace} disabled={options.length === 0}>
                                Add
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                <ConfirmResetDialog
                    open={openResetConfirm}
                    onOpenChange={setOpenResetConfirm}
                    onConfirm={() => {
                        reset();
                        // navigate to home after reset
                        window.location.href = '/';
                    }}
                />
            </aside>
        </TooltipProvider>
    );
}
