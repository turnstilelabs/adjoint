'use client';

import { useEffect, useMemo } from 'react';
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

export default function ProofDisplay() {
    const { toast } = useToast();

    const isChatOpen = useAppStore((s) => s.isChatOpen);
    const viewMode = useAppStore((s) => s.viewMode);
    const setIsChatOpen = useAppStore((s) => s.setIsChatOpen);
    const setViewMode = useAppStore((s) => s.setViewMode);
    const stepsReadyNonce = useAppStore((s) => s.stepsReadyNonce);
    const runDecomposition = useAppStore((s) => s.runDecomposition);
    const isDecomposing = useAppStore((s) => s.isDecomposing);
    const rawProof = useAppStore((s) => s.rawProof);
    const proof = useAppStore((s) => s.proof());
    const hasStructuredProof = useMemo(() => Boolean(proof?.sublemmas && proof.sublemmas.length > 0), [proof]);
    const hasRawProof = useMemo(() => Boolean(rawProof?.trim().length), [rawProof]);

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
        void runDecomposition();
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
                                    {viewMode === 'raw' ? 'Original Tentative Proof' : 'Structured Tentative Proof'}
                                </h2>
                            </div>

                            <div className="flex items-center gap-2">
                                {hasStructuredProof ? (
                                    <Button variant="outline" size="sm" onClick={handleToggleView}>
                                        {toggleViewCtaLabel}
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={handleStructureClick}
                                        disabled={!hasRawProof || isDecomposing}
                                    >
                                        {isDecomposing ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Structuring proof...
                                            </span>
                                        ) : (
                                            'Structure Proof'
                                        )}
                                    </Button>
                                )}
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
