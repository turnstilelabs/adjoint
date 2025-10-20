import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';

/**
 * Heuristics to interpret proposal payloads that may not include the full step list.
 * - If the proposal length equals current length, treat as full replacement.
 * - If it contains a single step, replace the inferred target step (by numeric prefix in title or default to last step).
 * - Otherwise, return the revised sublemma.
 */
export function mergeRevised(currentSteps: Sublemma[], revised: Sublemma[]): Sublemma[] {
  if (revised.length === currentSteps.length) {
    return revised;
  }
  if (revised.length === 1) {
    const idx = inferTargetIndex(currentSteps, revised);
    if (idx !== null && idx >= 0 && idx < currentSteps.length) {
      const next = [...currentSteps];
      next[idx] = revised[0];
      return next;
    }
  }

  return revised;
}

function inferTargetIndex(currentSteps: Sublemma[], revised: Sublemma[]): number | null {
  if (revised.length !== 1) return null;
  const t = (revised[0].title || '').trim();
  const m = t.match(/^\s*(?:Step\s*)?(\d+)[\.\)]?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n >= 1 && n <= currentSteps.length) return n - 1;
  }
  // Default heuristic: last step
  return currentSteps.length > 0 ? currentSteps.length - 1 : null;
}
