import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';

export function computeProofDiff(currentSteps: Sublemma[], revisedSteps: Sublemma[]): Change[] {
  const changes: Change[] = [];
  const maxLen = Math.max(currentSteps.length, revisedSteps.length);
  for (let i = 0; i < maxLen; i++) {
    const a = currentSteps[i];
    const b = revisedSteps[i];
    if (a && !b) {
      changes.push({ kind: 'remove', at: i, step: a });
    } else if (!a && b) {
      changes.push({ kind: 'add', at: i, step: b });
    } else if (a && b) {
      const titleChanged = (a.title || '') !== (b.title || '');
      const statementChanged = (a.statement || '') !== (b.statement || '');
      const proofChanged = (a.proof || '') !== (b.proof || '');
      if (titleChanged || statementChanged || proofChanged) {
        changes.push({
          kind: 'modify',
          at: i,
          old: a,
          next: b,
          titleChanged,
          statementChanged,
          proofChanged,
        });
      }
    }
  }
  return changes;
}

/**
 * Minimal diff between current proof and a proposed revision.
 * Aligns by index (fast) and flags only changed parts for display.
 * This keeps the preview concise and performant.
 */
type Change =
  | { kind: 'add'; at: number; step: Sublemma }
  | { kind: 'remove'; at: number; step: Sublemma }
  | {
      kind: 'modify';
      at: number;
      old: Sublemma;
      next: Sublemma;
      titleChanged?: boolean;
      statementChanged?: boolean;
      proofChanged?: boolean;
    };

export type ProofDiff = Change[];
