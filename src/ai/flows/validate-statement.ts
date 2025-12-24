'use server';
/**
 * @fileOverview Validates if a given string is a valid mathematical statement.
 *
 * - validateStatement - A function that handles the validation of a mathematical statement.
 * - ValidateStatementInput - The input type for the validateStatement function.
 * - ValidateStatementOutput - The return type for the validateStatement function.
 */

import { ai, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';

const ValidateStatementInputSchema = z.object({
  statement: z.string().describe('The mathematical statement to validate.'),
});
export type ValidateStatementInput = z.infer<typeof ValidateStatementInputSchema>;

const ValidateStatementOutputSchema = z.object({
  validity: z
    .enum(['VALID', 'INVALID', 'INCOMPLETE'])
    .describe('The validity of the mathematical statement.'),
  reasoning: z.string().describe('A brief explanation for the given validity classification.'),
});
export type ValidateStatementOutput = z.infer<typeof ValidateStatementOutputSchema>;

export async function validateStatement(
  input: ValidateStatementInput,
): Promise<ValidateStatementOutput> {
  return validateStatementFlow(input);
}

const validateStatementFlow = ai.defineFlow(
  {
    name: 'validateStatementFlow',
    inputSchema: ValidateStatementInputSchema,
    outputSchema: ValidateStatementOutputSchema,
  },
  async (input: ValidateStatementInput) => {
    const provider = (llmId.split('/')?.[0]) || 'unknown';
    const candidates: string[] = [];
    if (provider === 'googleai') {
      candidates.push(llmId);
      const proId = 'googleai/gemini-2.5-pro';
      if (llmId !== proId) candidates.push(proId);
      if (env.OPENAI_API_KEY) candidates.push('openai/gpt-4o-mini');
    } else {
      candidates.push(llmId);
    }

    const system = 'You are a precise JSON API. Return ONLY a single JSON object with exactly two keys: "validity" and "reasoning". The "validity" value must be one of "VALID", "INVALID", "INCOMPLETE" (uppercase). Do not include markdown fences or any extra text or keys.';
    const user = `You are a mathematical expert. Your task is to analyze a given string and determine if it represents a valid mathematical statement that can be proven.\n\nAnalyze the following statement:\n"${input.statement}"\n\nClassify the statement into one of three categories and provide a brief, one-sentence reasoning for your choice.\n\n1.  VALID: The statement is a well-formed and complete mathematical assertion that is suitable for a proof attempt.\n    - Reasoning example: "This is a standard theorem in group theory."\n2.  INVALID: The statement is not a mathematical problem to be solved. This includes questions, requests for definitions, or nonsensical text.\n    - Reasoning example: "This appears to be a request for a definition, not a problem to be solved." or "This seems to be a general question, not a mathematical statement."\n3.  INCOMPLETE: The statement is a fragment or is missing context, making it impossible to judge its validity.\n    - Reasoning example: "The statement is missing a conclusion."\n\nStrict output requirements:\n- Return ONLY this JSON object with exactly these two keys:\n{"validity":"VALID|INVALID|INCOMPLETE","reasoning":"<brief one-sentence explanation>"}\n- Validity must be uppercase exactly as shown.\n- Do not include markdown, code fences, or any additional keys or text outside the JSON object.`;

    let lastErr: any = null;
    for (const cand of candidates) {
      try {
        const { output } = await ai.generate({
          model: cand,
          system,
          prompt: user,
          output: { schema: ValidateStatementOutputSchema },
        });
        if (!output?.validity || !output?.reasoning) {
          throw new Error('The AI failed to return a valid validity assessment. The response was malformed.');
        }
        return output;
      } catch (e: any) {
        const norm = normalizeModelError(e);
        lastErr = norm;
        if (norm.code === 'MODEL_RATE_LIMIT') continue;
        throw new Error(norm.message);
      }
    }
    throw new Error((lastErr && lastErr.message) || 'The AI failed to return a valid validity assessment. The response was malformed.');
  },
);

//
// New: Validate a proof excerpt in the context of a lemma statement
//
const ValidateProofExcerptInputSchema = z.object({
  excerpt: z.string().describe('The selected proof excerpt to check.'),
  lemmaStatement: z.string().describe("The lemma's statement that this proof excerpt is addressing."),
});
export type ValidateProofExcerptInput = z.infer<typeof ValidateProofExcerptInputSchema>;

// Reuse ValidateStatementOutputSchema for compatibility with existing UI toasts
export async function validateProofExcerptInContext(
  input: ValidateProofExcerptInput,
): Promise<ValidateStatementOutput> {
  return validateProofExcerptFlow(input);
}

const validateProofExcerptFlow = ai.defineFlow(
  {
    name: 'validateProofExcerptInContextFlow',
    inputSchema: ValidateProofExcerptInputSchema,
    outputSchema: ValidateStatementOutputSchema,
  },
  async (input: ValidateProofExcerptInput) => {
    const provider = (llmId.split('/')?.[0]) || 'unknown';
    const candidates: string[] = [];
    if (provider === 'googleai') {
      candidates.push(llmId);
      const proId = 'googleai/gemini-2.5-pro';
      if (llmId !== proId) candidates.push(proId);
      if (env.OPENAI_API_KEY) candidates.push('openai/gpt-4o-mini');
    } else {
      candidates.push(llmId);
    }

    const system = 'You are a precise JSON API. Return ONLY a single JSON object with exactly two keys: "validity" and "reasoning". The "validity" value must be one of "VALID", "INVALID", "INCOMPLETE" (uppercase). Do not include markdown fences or any extra text or keys.';
    const user = `You are a mathematical expert. A user highlighted an excerpt from a tentative proof of a lemma. \nYou must assess whether the excerpt is an appropriate and useful proof step in the context of the lemma's statement.\n\nLemma statement:\n"${input.lemmaStatement}"\n\nSelected proof excerpt:\n"${input.excerpt}"\n\nClassify into one of:\n1) VALID: The excerpt is a coherent, relevant, and correct proof step (or sub-step) toward proving the lemma statement.\n2) INVALID: The excerpt is incorrect, irrelevant, or contradicts the lemma or standard mathematics.\n3) INCOMPLETE: The excerpt is too fragmentary or missing context to determine its correctness or relevance.\n\nReturn ONLY this JSON object:\n{"validity":"VALID|INVALID|INCOMPLETE","reasoning":"<brief one-sentence explanation>"}\nUse uppercase for validity; do not include any extra keys or text.`;

    let lastErr: any = null;
    for (const cand of candidates) {
      try {
        const { output } = await ai.generate({
          model: cand,
          system,
          prompt: user,
          output: { schema: ValidateStatementOutputSchema },
        });
        if (!output?.validity || !output?.reasoning) {
          throw new Error('The AI failed to return a valid proof excerpt assessment. The response was malformed.');
        }
        return output;
      } catch (e: any) {
        const norm = normalizeModelError(e);
        lastErr = norm;
        if (norm.code === 'MODEL_RATE_LIMIT') continue;
        throw new Error(norm.message);
      }
    }
    throw new Error((lastErr && lastErr.message) || 'The AI failed to return a valid proof excerpt assessment. The response was malformed.');
  },
);
