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

  const updateProof = (
    newSublemmas: Sublemma[],
    changeDescription: string,
    opts?: {
      recomputeGraph?: boolean;
      changedIndex?: number;
      change?: 'title' | 'content';
    },
  ) => {
    addProofVersion({ sublemmas: newSublemmas });
    /*
    TODO keep graph data when needed
    if (opts?.recomputeGraph === false) {
      // Update graph locally without recomputing
      if (opts?.change === 'title' && typeof opts.changedIndex === 'number') {
        const changedIndex = opts.changedIndex;
        setGraphData((prev) => {
          if (!prev) return prev;
          const nodeId = `step-${changedIndex + 1}`;
          const updatedNodes = prev.nodes.map((n) =>
            n.id === nodeId ? { ...n, label: newSublemmas[changedIndex].title } : n,
          );
          return { ...prev, nodes: updatedNodes };
        });
      } else if (opts?.change === 'content' && typeof opts.changedIndex === 'number') {
        const changedIndex = opts.changedIndex;
        setGraphData((prev) => {
          if (!prev) return prev;
          const nodeId = `step-${changedIndex + 1}`;
          const updatedNodes = prev.nodes.map((n) =>
            n.id === nodeId ? { ...n, content: newSublemmas[changedIndex].content } : n,
          );
          return { ...prev, nodes: updatedNodes };
        });
      }
      // For other edits, leave graph structure as-is
    } else {
      setGraphData(null); // Invalidate old graph data; ProofGraphView will generate on demand if open
    }

     */
  };

  const handleSublemmaChange = (index: number, newContent: string) => {
    const newSublemmas = [...proof.sublemmas];
    newSublemmas[index] = { ...newSublemmas[index], content: newContent };
    updateProof(newSublemmas, `Step ${index + 1} was manually edited.`, {
      recomputeGraph: false,
      changedIndex: index,
      change: 'content',
    });
  };

  const handleSublemmaTitleChange = (index: number, newTitle: string) => {
    const newSublemmas = [...proof.sublemmas];
    newSublemmas[index] = { ...newSublemmas[index], title: newTitle };
    updateProof(newSublemmas, `Step ${index + 1} title renamed.`, {
      recomputeGraph: false,
      changedIndex: index,
      change: 'title',
    });
  };

  const handleProofRevisionFromChat = (newSublemmas: Sublemma[]) => {
    updateProof(newSublemmas, 'Proof revised by AI assistant.');
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
                        onContentChange={(newContent) => handleSublemmaChange(index, newContent)}
                        onTitleChange={(newTitle) => handleSublemmaTitleChange(index, newTitle)}
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
          <InteractiveChat onProofRevision={handleProofRevisionFromChat} />
        </aside>
      )}
    </div>
  );
}
