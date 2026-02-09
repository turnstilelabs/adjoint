/** @fileOverview Decomposes a raw proof into a proved statement + sublemmas. */

import { ai, getLlmId, getLlmProvider, requireLlmApiKey } from '@/ai/genkit';
import { z } from 'genkit';
import { SublemmaSchema } from './schemas';
import { normalizeModelError } from '@/lib/model-error-core';
import { buildLlmCandidates } from '@/ai/llm-candidates';

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

const decomposeRawProofFlow = ai.defineFlow(
    {
        name: 'decomposeRawProofFlow',
        inputSchema: DecomposeRawProofInputSchema,
        outputSchema: DecomposeRawProofOutputSchema,
    },
    async (input: DecomposeRawProofInput) => {
        const llmId = getLlmId();
        const provider = getLlmProvider();
        const candidates = buildLlmCandidates(provider, llmId);
        const apiKey = requireLlmApiKey();

        const system = 'You are a mathematical writing expert. Return ONLY a single JSON object matching the schema. No markdown fences or extra text.';
        const user = `Instructions\nInput: A mathematical proof text (possibly short, counterexample-style, or a full argument)\nOutput: A JSON object with keys provedStatement, sublemmas, normalizedProof. Use LaTeX delimiters: inline $...$ and display $$...$$. For each sublemma.proof, write 2–6 narrative paragraphs for non-trivial steps with a BLANK LINE between paragraphs. Avoid bullet lists; keep natural prose. For very short/trivial proofs a single compact paragraph is acceptable.\n\nDecomposition Guidelines\n1. Identify Decomposition Candidates\n- Intermediate results used multiple times\n- Sub-arguments (>3–4 logical steps)\n- Conceptually distinct ideas or techniques\n- Standalone facts that simplify the main flow\n\n2. Atomic Statement Principle\nEach sublemma must:\n- Be self-contained with precise hypotheses/conclusions\n- Focus on a single mathematical idea\n- Be useful (reused or simplifies reasoning)\n- Clearly specify inputs/outputs\n\nAdditional constraints (critical)\n- You must return at least one sublemma. Never return an empty array.\n- If the proof is short or a counterexample, return exactly one sublemma:\n  • title: 'Counterexample' (or 'Direct proof' if appropriate)\n  • statement: the exact proved claim (same as provedStatement)\n  • proof: a clear, step-by-step explanation (include the specific counterexample and why it works)\n- Prefer 2–6 sublemmas for longer arguments.\n\nRaw proof:\n"""\n${input.rawProof}\n"""\n\nReturn strictly:\n{"provedStatement":string,"sublemmas":[{"title":string,"statement":string,"proof":string},...],"normalizedProof":string}`;

        let lastErr: ReturnType<typeof normalizeModelError> | null = null;
        for (const cand of candidates) {
            try {
                const { output } = await ai.generate({
                    model: cand,
                    system,
                    prompt: user,
                    config: { apiKey },
                    output: { schema: DecomposeRawProofOutputSchema },
                });
                if (!output) {
                    throw new Error('The AI failed to decompose the raw proof.');
                }

                // Normalize paragraphing for readability without touching math segments.
                const protectMath = (s: string) => {
                    const blocks: { t: 'math' | 'text'; v: string }[] = [];
                    let i = 0;
                    const pushText = (v: string) => { if (v) blocks.push({ t: 'text', v }); };
                    while (i < s.length) {
                        if (s.startsWith('$$', i)) {
                            const j = s.indexOf('$$', i + 2);
                            const end = j >= 0 ? j + 2 : s.length;
                            blocks.push({ t: 'math', v: s.slice(i, end) });
                            i = end;
                        } else if (s[i] === '$') {
                            const j = s.indexOf('$', i + 1);
                            const end = j >= 0 ? j + 1 : s.length;
                            blocks.push({ t: 'math', v: s.slice(i, end) });
                            i = end;
                        } else if (s.startsWith('\\[', i)) {
                            const j = s.indexOf('\\]', i + 2);
                            const end = j >= 0 ? j + 2 : s.length;
                            blocks.push({ t: 'math', v: s.slice(i, end) });
                            i = end;
                        } else if (s.startsWith('\\(', i)) {
                            const j = s.indexOf('\\)', i + 2);
                            const end = j >= 0 ? j + 2 : s.length;
                            blocks.push({ t: 'math', v: s.slice(i, end) });
                            i = end;
                        } else {
                            let j = i;
                            while (j < s.length && s[j] !== '$' && !s.startsWith('$$', j) && !s.startsWith('\\[', j) && !s.startsWith('\\(', j)) j++;
                            pushText(s.slice(i, j));
                            i = j;
                        }
                    }
                    return blocks;
                };

                const normalizeText = (txt: string) => {
                    const trimmed = txt.trim();
                    if (!trimmed) return txt; // preserve
                    const hasBlank = /\n\s*\n/.test(trimmed);
                    if (hasBlank || trimmed.length < 400) return txt; // already paragraphic or short

                    // Split into sentences conservatively (outside math, we already split text-only)
                    const sentences = trimmed
                        .replace(/\s+/g, ' ')
                        .split(/(?<=[\.\?\!])\s+/)
                        .filter(Boolean);
                    if (sentences.length < 3) return txt; // not enough to form paragraphs

                    const para: string[] = [];
                    let cur: string[] = [];
                    for (const snt of sentences) {
                        cur.push(snt);
                        if (cur.length >= 3) { // 2–3 sentences per paragraph
                            para.push(cur.join(' '));
                            cur = [];
                        }
                    }
                    if (cur.length) para.push(cur.join(' '));
                    return para.join('\n\n');
                };

                const normalizeProof = (s: string) => {
                    const parts = protectMath(s);
                    return parts
                        .map((p) => (p.t === 'math' ? p.v : normalizeText(p.v)))
                        .join('');
                };

                // Apply to normalizedProof and each sublemma.proof
                const out: DecomposeRawProofOutput = {
                    ...output,
                    normalizedProof: output.normalizedProof ? normalizeProof(String(output.normalizedProof)) : output.normalizedProof,
                    sublemmas: Array.isArray(output.sublemmas)
                        ? output.sublemmas.map((sl) => ({
                            ...sl,
                            proof: typeof sl.proof === 'string' ? normalizeProof(sl.proof) : sl.proof,
                        }))
                        : output.sublemmas,
                };

                return out;
            } catch (e: unknown) {
                const norm = normalizeModelError(e);
                lastErr = norm;
                if (norm.code === 'MODEL_RATE_LIMIT') continue;
                throw new Error(norm.message);
            }
        }
        throw new Error(lastErr?.message || 'The AI failed to decompose the raw proof.');
    },
);
