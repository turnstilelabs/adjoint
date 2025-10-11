'use client';
import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from '../../sublemma-item';
import { InteractiveChat } from '../../interactive-chat';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { ProofSidebar } from '../../proof-sidebar';
import { ProofGraphView } from '../../proof-graph-view';
import { useAppStore } from '@/state/app-store';
import EditableProblemCard from '@/components/features/proof/editable-problem-card';
import ProofValidationFooter from '@/components/features/proof/proof-validation-footer';

export default function ProofDisplay() {
  const isChatOpen = useAppStore((s) => s.isChatOpen);
  const viewMode = useAppStore((s) => s.viewMode);
  const activeVersionIndex = useAppStore((s) => s.activeVersionIdx);
  const proof = useAppStore((s) => s.proof());

  const addProofVersion = useAppStore((s) => s.addProofVersion);

  const handleSublemmaChange = (index: number, updates: Partial<Sublemma>) => {
    addProofVersion({
      sublemmas: proof.sublemmas.map((sublemma, idx) =>
        idx === index ? { ...sublemma, ...updates } : sublemma,
      ),
      graphData: proof.graphData
        ? {
            ...proof.graphData,
            nodes: proof.graphData.nodes.map((node) =>
              node.id === `step-${index + 1}`
                ? {
                    ...node,
                    content: updates.content ?? node.content,
                    label: updates.title ?? node.label,
                  }
                : node,
            ),
          }
        : undefined,
    });
  };

  return (
    <div className="flex h-screen w-full">
      <ProofSidebar />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <EditableProblemCard />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="max-w-4xl mx-auto">
              <div className="sticky top-0 z-20 flex items-center gap-2 mb-1 bg-background border-b">
                <h2 className="text-2xl font-bold font-headline">Tentative Proof</h2>
              </div>
              {viewMode === 'steps' ? (
                <div className="space-y-4">
                  <Accordion
                    type="multiple"
                    defaultValue={proof.sublemmas.map((_, i) => `item-${i + 1}`)}
                    className="w-full space-y-4 border-b-0"
                  >
                    {proof.sublemmas.map((sublemma, index) => (
                      <SublemmaItem
                        key={`${activeVersionIndex}-${index}`}
                        step={index + 1}
                        title={sublemma.title}
                        content={sublemma.content}
                        onContentChange={(content) => handleSublemmaChange(index, { content })}
                        onTitleChange={(title) => handleSublemmaChange(index, { title })}
                      />
                    ))}
                  </Accordion>
                </div>
              ) : (
                <ProofGraphView />
              )}

              <ProofValidationFooter />
            </div>
          </div>
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
