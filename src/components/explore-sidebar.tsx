"use client";

import Link from 'next/link';
import * as React from 'react';
import { LogoSmall } from '@/components/logo-small';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AttemptProofChooser } from '@/components/explore/attempt-proof-chooser';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BookOpen, Code2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function ExploreSidebar() {
    const router = useRouter();
    const [openLiterature, setOpenLiterature] = React.useState(false);
    const [openCode, setOpenCode] = React.useState(false);
    const [openProve, setOpenProve] = React.useState(false);

    return (
        <TooltipProvider>
            <aside className="w-14 flex flex-col items-center py-4 border-r bg-card shrink-0">
                <Link
                    href="/"
                    onClick={(e) => {
                        e.preventDefault();
                        // Preserve Explore progress. No reset confirmation.
                        router.push('/');
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
            </aside>
        </TooltipProvider>
    );
}
