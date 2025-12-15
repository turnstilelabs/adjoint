'use client';
import { InteractiveChat } from '../../chat/interactive-chat';
import { ProofSidebar } from '../../proof-sidebar';
import { ProofGraphView } from '../../proof-graph-view';
import { useAppStore } from '@/state/app-store';
import EditableProblemCard from '@/components/features/proof/editable-problem-card';
import ProofValidationFooter from '@/components/features/proof/proof-validation-footer';
import ProofSteps from '@/components/features/proof/proof-steps';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ProofDisplay() {
  const isChatOpen = useAppStore((s) => s.isChatOpen);
  const viewMode = useAppStore((s) => s.viewMode);
  const setIsChatOpen = useAppStore((s) => s.setIsChatOpen);
  const pendingSuggestion = useAppStore((s) => s.pendingSuggestion);
  const pendingRejection = useAppStore((s) => s.pendingRejection);

  return (
    <div className="inset-0 absolute overflow-hidden flex">
      <ProofSidebar />

      <main className="flex-1 min-w-0 min-h-0 h-full overflow-hidden flex flex-col">
        <div className="mx-auto w-full max-w-5xl p-3 md:p-10 pb-0 gap-10 flex-1 min-h-0 flex flex-col">
          <EditableProblemCard />

          {!pendingSuggestion && !pendingRejection && (
            <ScrollArea className="flex-1 min-h-0 -mx-5 px-5">
              <div className="sticky top-0 z-20 flex items-center gap-2 mb-3 bg-background border-b">
                <h2 className="text-2xl font-bold font-headline">Tentative Proof</h2>
              </div>

              {viewMode === 'steps' ? <ProofSteps /> : <ProofGraphView />}

              <ProofValidationFooter />
            </ScrollArea>
          )}
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
