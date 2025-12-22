import { Accordion } from '@/components/ui/accordion';
import { SublemmaItem } from '@/components/sublemma-item';
import { useAppStore } from '@/state/app-store';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';

function ProofSteps() {
  const proof = useAppStore((s) => s.proof());
  const snapshotStructuredEdit = useAppStore((s) => s.snapshotStructuredEdit);

  if (!proof?.sublemmas?.length) {
    return (
      <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
        No structured steps are available for this version yet. Switch to <b>Raw Proof</b> or click{' '}
        <b>Structure Proof</b>.
      </div>
    );
  }

  const handleSublemmaChange = (index: number, updates: Partial<Sublemma>) => {
    const prevStepValidation = proof.stepValidation || {};
    // Invalidate analysis for the edited step, and mark it as last edited.
    const { [index]: _omit, ...rest } = prevStepValidation;

    snapshotStructuredEdit({
      sublemmas: proof.sublemmas.map((sublemma, idx) =>
        idx === index ? { ...sublemma, ...updates } : sublemma,
      ),
      stepValidation: rest,
      lastEditedStepIdx: index,
      // Editing a step likely invalidates the whole-proof analysis as well.
      validationResult: undefined,
      graphData: proof.graphData
        ? {
          ...proof.graphData,
          nodes: proof.graphData.nodes.map((node) =>
            node.id === `step-${index + 1}`
              ? {
                ...node,
                content: updates.statement ?? node.content,
                label: updates.title ?? node.label,
              }
              : node,
          ),
        }
        : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <Accordion
        type="multiple"
        defaultValue={proof.sublemmas.map((_, i) => `item-${i + 1}`)}
        className="w-full space-y-4 border-b-0"
      >
        {proof.sublemmas.map((sublemma, index) => (
          <SublemmaItem
            key={index}
            stepIndex={index}
            step={index + 1}
            title={sublemma.title}
            statement={sublemma.statement}
            proof={sublemma.proof}
            analysis={proof.stepValidation?.[index]}
            showReanalyzeCta={proof.lastEditedStepIdx === index}
            onChange={(updates) => handleSublemmaChange(index, updates)}
          />
        ))}
      </Accordion>
    </div>
  );
}

export default ProofSteps;
