'use client';

import { InteractiveChat } from '../../chat/interactive-chat';
import { ProofSidebar } from '../../proof-sidebar';
import { ProofGraphView } from '../../proof-graph-view';
import { useAppStore } from '@/state/app-store';
import EditableProblemCard from '@/components/features/proof/editable-problem-card';
import ProofValidationFooter from '@/components/features/proof/proof-validation-footer';
import ProofSteps from '@/components/features/proof/proof-steps';
import RawProofView from '@/components/features/proof/raw-proof-view';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ProofDisplay() {
    const isChatOpen = useAppStore((s) => s.isChatOpen);
    const viewMode = useAppStore((s) => s.viewMode);
    const setIsChatOpen = useAppStore((s) => s.setIsChatOpen);

    return (
        <div className="inset-0 absolute overflow-hidden flex">
            <ProofSidebar />

            <main className="flex-1 min-w-0 min-h-0 h-full overflow-hidden flex flex-col">
                {/* Keep a comfortable reading width for proof content. */}
                <div className="mx-auto w-full max-w-4xl p-3 md:p-10 pb-0 gap-10 flex-1 min-h-0 flex flex-col">
                    <div className="pb-2">
                        <EditableProblemCard />
                    </div>

                    <ScrollArea className="flex-1 min-h-0 -mx-5 px-5">
                        {/* Removed the "Tentative Proof" / "Structured Tentative Proof" header + divider.
                            Keep some breathing room below the statement card. */}
                        <div className="pt-4" />

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
