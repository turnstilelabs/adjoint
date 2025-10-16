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
import { useToast } from '@/hooks/use-toast';
import { useEffect, useTransition } from 'react';
import { generateProofGraphAction } from '@/app/actions';
import { isEqual } from 'lodash';
import { showModelError } from '@/lib/model-errors';

export default function ProofDisplay() {
  const { toast } = useToast();
  const [isGraphLoading, startGraphLoadingTransition] = useTransition();

  const {
    isChatOpen,
    viewMode,
    activeVersionIdx,
    proof,
    addProofVersion,
    updateCurrentProofVersion,
  } = useAppStore();

  const goBack = useAppStore((s) => s.goBack);

  const currentProof = proof();

  useEffect(() => {
    if (currentProof && !currentProof.graphData && !isGraphLoading) {
      startGraphLoadingTransition(async () => {
        const result = await generateProofGraphAction(currentProof.sublemmas);
        const latestProof = useAppStore.getState().proof();
        if (latestProof && isEqual(latestProof.sublemmas, currentProof.sublemmas)) {
          if ('nodes' in result && 'edges' in result) {
            updateCurrentProofVersion({
              graphData: {
                nodes: result.nodes.map((n) => {
                  const m = n.id.match(/step-(\d+)/);
                  const idx = m ? parseInt(m[1], 10) - 1 : -1;
                  const content =
                    idx >= 0 && idx < latestProof.sublemmas.length
                      ? latestProof.sublemmas[idx].statement
                      : '';
                  return { ...n, content, label: n.label };
                }),
                edges: result.edges,
              },
            });
          } else {
            const fallback =
              'Adjoint’s connection to the model was interrupted, please go back and retry.';
            const code = showModelError(toast, (result as any)?.error, goBack, 'Graph error');
            if (!code) {
              toast({
                title: 'Graph error',
                description: fallback,
                variant: 'destructive',
              });
            }
          }
        }
      });
    }
  }, [currentProof, isGraphLoading, updateCurrentProofVersion, toast]);

  const handleSublemmaChange = (index: number, updates: Partial<Sublemma>) => {
    if (!currentProof) return;
    addProofVersion({
      sublemmas: currentProof.sublemmas.map((sublemma, idx) =>
        idx === index ? { ...sublemma, ...updates } : sublemma,
      ),
      graphData: undefined,
    });
  };

  if (!currentProof) return null;

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
                    defaultValue={currentProof.sublemmas.map((_, i) => `item-${i + 1}`)}
                    className="w-full space-y-4 border-b-0"
                  >
                    {currentProof.sublemmas.map((sublemma, index) => (
                      <SublemmaItem
                        key={`${activeVersionIdx}-${index}`}
                        step={index + 1}
                        title={sublemma.title}
                        statement={sublemma.statement}
                        proof={sublemma.proof}
                        onTitleChange={(title) => handleSublemmaChange(index, { title })}
                        onStatementChange={(statement) =>
                          handleSublemmaChange(index, { statement })
                        }
                        onProofChange={(proof) => handleSublemmaChange(index, { proof })}
                      />
                    ))}
                  </Accordion>
                </div>
              ) : (
                // ProofGraphView does not take an isLoading prop; it sources its own data
                <ProofGraphView />
              )}
              <ProofValidationFooter />
            </div>
          </div>
        </div>
      </main>
      {isChatOpen && (
        <aside className="w-[30rem] border-l flex flex-col h-screen">
          {/* InteractiveChat is self-contained and uses the store, no props needed */}
          <InteractiveChat />
        </aside>
      )}
    </div>
  );
}
