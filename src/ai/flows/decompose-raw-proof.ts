
/**
 * @fileOverview Decomposes a raw proof text into a proved statement and sublemmas.
 */

import { ai, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { SublemmaSchema } from './schemas';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';

const DecomposeRawProofInputSchema = z.object({
    rawProof: z
        .string()
        .min(10)
        .describe('The raw continuous proof text produced by the attempt-proof flow.'),
});
export type DecomposeRawProofInput = z.infer<typeof DecomposeRawProofInputSchema>;

const DecomposeRawProofOutputSchema = z.object({
    provedStatement: z
        .string()
        .describe('The precise mathematical statement that the provided proof text actually establishes.'),
    sublemmas: z.array(SublemmaSchema).describe('A sequence of sublemmas consistent with the proof.'),
    normalizedProof: z
        .string()
        .describe('An optional cleaned/normalized rendering of the full proof for export and display.'),
});
export type DecomposeRawProofOutput = z.infer<typeof DecomposeRawProofOutputSchema>;

export async function decomposeRawProof(
    input: DecomposeRawProofInput,
): Promise<DecomposeRawProofOutput> {
    return decomposeRawProofFlow(input);
}

const prompt = ai.definePrompt({
    name: 'decomposeRawProofPrompt',
    input: { schema: DecomposeRawProofInputSchema },
    output: { schema: DecomposeRawProofOutputSchema },
    system:
        'You are a mathematical writing expert. Return ONLY a single JSON object matching the schema. No markdown fences or extra text.',
    prompt: `Instructions
Input: A mathematical proof text (possibly short, counterexample-style, or a full argument)
Output: A JSON object with keys provedStatement, sublemmas, normalizedProof. Use LaTeX delimiters: inline $...$ and display $$...$$.

Decomposition Guidelines
1. Identify Decomposition Candidates
- Intermediate results used multiple times
- Sub-arguments (>3–4 logical steps)
- Conceptually distinct ideas or techniques
- Standalone facts that simplify the main flow

2. Atomic Statement Principle
Each sublemma must:
- Be self-contained with precise hypotheses/conclusions
- Focus on a single mathematical idea
- Be useful (reused or simplifies reasoning)
- Clearly specify inputs/outputs

Additional constraints (critical)
- You must return at least one sublemma. Never return an empty array.
- If the proof is short or a counterexample, return exactly one sublemma:
  • title: 'Counterexample' (or 'Direct proof' if appropriate)
  • statement: the exact proved claim (same as provedStatement)
  • proof: a clear, step-by-step explanation (include the specific counterexample and why it works)
- Prefer 2–6 sublemmas for longer arguments.

Raw proof:
"""
{{{rawProof}}}
"""

Return strictly:
{"provedStatement":string,"sublemmas":[{"title":string,"statement":string,"proof":string},...],"normalizedProof":string}`,
});

const decomposeRawProofFlow = ai.defineFlow(
    {
        name: 'decomposeRawProofFlow',
        inputSchema: DecomposeRawProofInputSchema,
        outputSchema: DecomposeRawProofOutputSchema,
    },
    async (input: DecomposeRawProofInput) => {
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

        const system = 'You are a mathematical writing expert. Return ONLY a single JSON object matching the schema. No markdown fences or extra text.';
        const user = `Instructions\nInput: A mathematical proof text (possibly short, counterexample-style, or a full argument)\nOutput: A JSON object with keys provedStatement, sublemmas, normalizedProof. Use LaTeX delimiters: inline $...$ and display $$...$$.\n\nDecomposition Guidelines\n1. Identify Decomposition Candidates\n- Intermediate results used multiple times\n- Sub-arguments (>3–4 logical steps)\n- Conceptually distinct ideas or techniques\n- Standalone facts that simplify the main flow\n\n2. Atomic Statement Principle\nEach sublemma must:\n- Be self-contained with precise hypotheses/conclusions\n- Focus on a single mathematical idea\n- Be useful (reused or simplifies reasoning)\n- Clearly specify inputs/outputs\n\nAdditional constraints (critical)\n- You must return at least one sublemma. Never return an empty array.\n- If the proof is short or a counterexample, return exactly one sublemma:\n  • title: 'Counterexample' (or 'Direct proof' if appropriate)\n  • statement: the exact proved claim (same as provedStatement)\n  • proof: a clear, step-by-step explanation (include the specific counterexample and why it works)\n- Prefer 2–6 sublemmas for longer arguments.\n\nRaw proof:\n"""\n${input.rawProof}\n"""\n\nReturn strictly:\n{"provedStatement":string,"sublemmas":[{"title":string,"statement":string,"proof":string},...],"normalizedProof":string}`;

        let lastErr: any = null;
        for (const cand of candidates) {
            try {
                const { output } = await ai.generate({
                    model: cand,
                    system,
                    prompt: user,
                    output: { schema: DecomposeRawProofOutputSchema },
                });
                if (!output) {
                    throw new Error('The AI failed to decompose the raw proof.');
                }
                return output;
            } catch (e: any) {
                const norm = normalizeModelError(e);
                lastErr = norm;
                if (norm.code === 'MODEL_RATE_LIMIT') continue;
                throw new Error(norm.message);
            }
        }
        throw new Error((lastErr && lastErr.message) || 'The AI failed to decompose the raw proof.');
    },
);
