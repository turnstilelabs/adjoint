'use server';

import { decomposeProof } from '@/ai/flows/llm-proof-decomposition';
import { addProofStepWithLLMValidation } from '@/ai/flows/add-proof-step-validation';
import { interactiveQuestioning } from '@/ai/flows/interactive-questioning';
import { autoformalizeAndProve } from '@/ai/flows/autoformalize';

export async function decomposeProblemAction(problem: string) {
  if (!problem) {
    return { success: false, error: 'Problem statement cannot be empty.' };
  }
  try {
    const { sublemmas } = await decomposeProof({ problem });
    return { success: true, sublemmas };
  } catch (error) {
    console.error('decomposeProblemAction error:', error);
    return { success: false, error: 'Failed to decompose the problem with AI.' };
  }
}

export async function addProofStepAction(problem: string, currentSteps: string, proposedStep: string) {
  if (!proposedStep) {
    return { success: false, error: 'Proposed step cannot be empty.' };
  }
  try {
    const result = await addProofStepWithLLMValidation({ problem, currentSteps, proposedStep });
    return { success: true, ...result };
  } catch (error) {
    console.error('addProofStepAction error:', error);
    return { success: false, error: 'Failed to validate the proof step with AI.' };
  }
}

export async function askQuestionAction(question: string, proofSteps: string[]) {
  if (!question) {
    return { success: false, error: 'Question cannot be empty.' };
  }
  try {
    const { answer } = await interactiveQuestioning({ question, proofSteps });
    return { success: true, answer };
  } catch (error) {
    console.error('askQuestionAction error:', error);
    return { success: false, error: 'Failed to get an answer from AI.' };
  }
}

export async function autoformalizeAction(lemma: string) {
  if (!lemma) {
    return { success: false, error: 'Lemma cannot be empty.' };
  }
  try {
    const result = await autoformalizeAndProve({ lemma });
    return { success: true, ...result };
  } catch (error) {
    console.error('autoformalizeAction error:', error);
    return { success: false, error: 'Failed to autoformalize with AI.' };
  }
}
