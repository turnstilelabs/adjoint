'use client';

import { useEffect, useMemo, useState } from 'react';
import { InteractiveChat } from '../../chat/interactive-chat';
import { ProofSidebar } from '../../proof-sidebar';
import { ProofGraphView } from '../../proof-graph-view';
import { useAppStore } from '@/state/app-store';
import EditableProblemCard from '@/components/features/proof/editable-problem-card';
import ProofValidationFooter from '@/components/features/proof/proof-validation-footer';
import ProofSteps from '@/components/features/proof/proof-steps';
import RawProofView from '@/components/features/proof/raw-proof-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ProofDisplay() {
    const { toast } = useToast();

    const [confirmOpen, setConfirmOpen] = useState(false);

    const isChatOpen = useAppStore((s) => s.isChatOpen);
    const viewMode = useAppStore((s) => s.viewMode);
    const setIsChatOpen = useAppStore((s) => s.setIsChatOpen);
    const setViewMode = useAppStore((s) => s.setViewMode);
    const stepsReadyNonce = useAppStore((s) => s.stepsReadyNonce);
    const runDecomposition = useAppStore((s) => s.runDecomposition);
    const isDecomposing = useAppStore((s) => s.isDecomposing);
    const rawProof = useAppStore((s) => s.rawProof);
    const decomposedRaw = useAppStore((s) => s.decomposedRaw);
    const proof = useAppStore((s) => s.proof());
    const hasUserEditedStructuredForCurrentRaw = useAppStore(
        (s) => s.hasUserEditedStructuredForCurrentRaw,
    );

    const hasRawProof = useMemo(() => Boolean(rawProof?.trim().length), [rawProof]);

    // The currently selected raw version (if any). This matters when you restore older raw versions.
    const activeRaw = useMemo(() => (proof?.type === 'raw' ? proof : null), [proof]);

    // If the editor text differs from the selected raw version content, treat it as a new draft.
    const rawIsDirty = useMemo(() => {
        if (!activeRaw) return false;
        return (rawProof || '').trim() !== (activeRaw.content || '').trim();
    }, [rawProof, activeRaw]);

    // Whether there exists any structured versions saved for the currently selected raw version.
    // NOTE: this intentionally looks at history, not only `decomposedRaw`, so restoring an old raw
    // version with existing structured minors shows "Go to Structured Proof".
    const hasStructuredForActiveRawMajor = useAppStore((s) => {
        const cur = s.proof();
        if (!cur || cur.type !== 'raw') return false;
        return s.proofHistory.some((v) => v.type === 'structured' && v.baseMajor === cur.baseMajor);
    });

    // We consider steps "ready" iff we decomposed *this exact raw draft*.
    // Used to decide whether clicking should toggle vs re-decompose.
    const hasStructuredForCurrentRaw = useMemo(() => {
        const a = (rawProof || '').trim();
        const b = (decomposedRaw || '').trim();
        return a.length > 0 && b.length > 0 && a === b;
    }, [rawProof, decomposedRaw]);

    // Phase B signal: background decomposition finished.
    useEffect(() => {
        if (!stepsReadyNonce) return;
        toast({
            title: 'Steps are ready',
            description: 'Adjoint structured the proof into steps.',
            action: (
                <ToastAction altText="View steps" onClick={() => setViewMode('structured')}>
                    View steps
                </ToastAction>
            ),
        });
    }, [stepsReadyNonce, setViewMode, toast]);

    const handleStructureClick = () => {
        if (isDecomposing || !hasRawProof) return;

        // Show warning before running decomposition if it would overwrite a user-edited structured view.
        if (hasUserEditedStructuredForCurrentRaw()) {
            setConfirmOpen(true);
            return;
        }

        void runDecomposition();
    };

    const handleConfirmOverride = () => {
        void runDecomposition();
        setConfirmOpen(false);
    };

    const toggleViewCtaLabel = viewMode === 'structured' ? 'Go to Raw Proof' : 'Go to Structured Proof';

    const handleToggleView = () => {
        setViewMode(viewMode === 'structured' ? 'raw' : 'structured');
    };

    return (
        <div className="inset-0 absolute overflow-hidden flex">
            <ProofSidebar />

            <main className="flex-1 min-w-0 min-h-0 h-full overflow-hidden flex flex-col">
                <div className="mx-auto w-full max-w-5xl p-3 md:p-10 pb-0 gap-10 flex-1 min-h-0 flex flex-col">
                    <EditableProblemCard />

                    <ScrollArea className="flex-1 min-h-0 -mx-5 px-5">
                        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 mb-3 bg-background border-b py-2">
                            <div>
                                <h2 className="text-2xl font-bold font-headline">
                                    {viewMode === 'raw' ? 'Tentative Proof' : 'Structured Tentative Proof'}
                                </h2>
                            </div>

                            <div className="flex items-center gap-2">
                                {isDecomposing ? (
                                    <Button size="sm" disabled>
                                        <span className="inline-flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Structuring proof...
                                        </span>
                                    </Button>
                                ) : viewMode === 'structured' ? (
                                    <Button variant="outline" size="sm" onClick={() => setViewMode('raw')}>
                                        Go to Raw Proof
                                    </Button>
                                ) : viewMode === 'raw' ? (
                                    rawIsDirty || !hasStructuredForActiveRawMajor ? (
                                        <Button
                                            size="sm"
                                            onClick={handleStructureClick}
                                            disabled={!hasRawProof}
                                        >
                                            Structure Proof
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setViewMode('structured')}
                                        >
                                            Go to Structured Proof
                                        </Button>
                                    )
                                ) : hasStructuredForCurrentRaw ? (
                                    <Button variant="outline" size="sm" onClick={handleToggleView}>
                                        {toggleViewCtaLabel}
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={handleStructureClick}
                                        disabled={!hasRawProof}
                                    >
                                        Structure Proof
                                    </Button>
                                )}

                                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Override structured edits?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                A structured version for this raw draft has user edits. Structuring again will
                                                override the latest structured view. Continue?
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleConfirmOverride}>
                                                Structure (override)
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>

                        {viewMode === 'raw' && <RawProofView />}
                        {viewMode === 'structured' && <ProofSteps />}
                        {viewMode === 'graph' && <ProofGraphView />}

                        <ProofValidationFooter />
                    </ScrollArea>
                </div>
            </main>

            {isChatOpen && (
                <>
                    {/* Click-outside overlay to close chat panel */}
                    <div
                        className="fixed inset-0 z-20 bg-transparent xl:hidden"
                        onClick={() => setIsChatOpen(false)}
                        aria-hidden="true"
                    />
                    <aside className="absolute inset-0 left-14 z-30 xl:static xl:w-[28rem] xl:border-l bg-background h-full overflow-y-auto flex flex-col">
                        <InteractiveChat />
                    </aside>
                </>
            )}
        </div>
    );
}
