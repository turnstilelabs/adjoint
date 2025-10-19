'use client';
import { InteractiveChat } from '../../interactive-chat';
import { ProofSidebar } from '../../proof-sidebar';
import { ProofGraphView } from '../../proof-graph-view';
import { useAppStore } from '@/state/app-store';
import EditableProblemCard from '@/components/features/proof/editable-problem-card';
import ProofValidationFooter from '@/components/features/proof/proof-validation-footer';
import ProofSteps from '@/components/features/proof/proof-steps';

export default function ProofDisplay() {
  const isChatOpen = useAppStore((s) => s.isChatOpen);
  const viewMode = useAppStore((s) => s.viewMode);

  return (
    <div className="inset-0 absolute overflow-hidden flex">
      <ProofSidebar />

      <main className="flex flex-col grow mx-auto max-w-5xl  p-10 pb-0 gap-10 overflow-hidden h-full">
        <EditableProblemCard />

        <div className="flex-1 overflow-y-auto -mx-5 px-5">
          <div className="sticky top-0 z-20 flex items-center gap-2 mb-1 bg-background border-b">
            <h2 className="text-2xl font-bold font-headline">Tentative Proof</h2>
          </div>
          {viewMode === 'steps' ? <ProofSteps /> : <ProofGraphView />}

          <ProofValidationFooter />
        </div>
      </main>
      {isChatOpen && (
        <aside className="w-[30rem] border-l flex flex-col h-screen">
          <InteractiveChat />
        </aside>
      )}
    </div>
  );
}
