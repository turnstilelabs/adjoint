/** @fileOverview Convert a highlighted selection (LaTeX-ish + plain) into a SymPySpec JSON. */

import { ai, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';

const SymPyOpSchema = z.enum(['verify', 'simplify', 'solve', 'diff', 'integrate', 'dsolve']);

const ConvertSelectionToSympySpecInputSchema = z.object({
    selectionLatex: z.string().describe('Selected text with LaTeX math delimiters when available.'),
    selectionText: z.string().describe('Selected plain visible text.'),
});
export type ConvertSelectionToSympySpecInput = z.infer<typeof ConvertSelectionToSympySpecInputSchema>;

// A conservative spec: everything SymPy will parse, no LaTeX.
// NOTE: we use a plain union (not discriminatedUnion) because zod's discriminatedUnion
// does not accept refined schemas (ZodEffects) as options.
const SymPySpecSchema = z.union([
    z.object({
        op: z.literal('verify'),
        lhs: z.string().describe('Left-hand side expression (SymPy parseable).'),
        rhs: z.string().describe('Right-hand side expression (SymPy parseable).'),
        notes: z.string().optional(),
    }),
    z.object({
        op: z.literal('simplify'),
        expr: z.string().describe('Expression (SymPy parseable).'),
        notes: z.string().optional(),
    }),
    z.object({
        op: z.literal('solve'),
        lhs: z.string().describe('Left-hand side expression (SymPy parseable).'),
        rhs: z.string().describe('Right-hand side expression (SymPy parseable).'),
        notes: z.string().optional(),
    }),
    z
        .object({
            op: z.literal('dsolve'),
            // We support either a free-form ODE string (ode) OR structured (lhs/rhs).
            ode: z.string().optional().describe('ODE equation string, e.g. "y\'\' + 9*y = 0"'),
            lhs: z.string().optional().describe('Left-hand side ODE expression (SymPy parseable).'),
            rhs: z.string().optional().describe('Right-hand side ODE expression (SymPy parseable).'),
            func: z.string().optional().describe('Dependent function name (e.g. "y").'),
            var: z.string().optional().describe('Independent variable name (e.g. "x" or "t").'),
            notes: z.string().optional(),
        })
        .refine(
            (v) =>
                (typeof v.ode === 'string' && v.ode.trim().length > 0) ||
                (typeof v.lhs === 'string' && typeof v.rhs === 'string'),
            { message: 'dsolve requires either `ode` or both `lhs` and `rhs`' },
        ),
    z.object({
        op: z.literal('diff'),
        expr: z.string().describe('Expression (SymPy parseable).'),
        var: z.string().optional().describe('Variable for differentiation (e.g. "x").'),
        notes: z.string().optional(),
    }),
    z.object({
        op: z.literal('integrate'),
        expr: z.string().describe('Expression (SymPy parseable).'),
        var: z.string().optional().describe('Variable for integration (e.g. "x").'),
        notes: z.string().optional(),
    }),
]);
export type SymPySpec = z.infer<typeof SymPySpecSchema>;

function extractJsonObject(text: string): unknown {
    const raw = String(text ?? '').trim();
    if (!raw) throw new Error('Empty model reply');

    // Strip common markdown fences.
    const unfenced = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    // Fast path: direct parse.
    try {
        return JSON.parse(unfenced);
    } catch {
        // continue
    }

    // Best-effort: find the first '{' and last '}'
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start < 0 || end <= start) {
        throw new Error('Model reply did not contain a JSON object');
    }
    const slice = unfenced.slice(start, end + 1);
    try {
        return JSON.parse(slice);
    } catch {
        // If there are trailing commas or single quotes, do not attempt unsafe fixes here.
        throw new Error('Model reply contained malformed JSON');
    }
}

export async function convertSelectionToSympySpec(
    input: ConvertSelectionToSympySpecInput,
): Promise<SymPySpec> {
    return convertSelectionToSympySpecFlow(input);
}

const convertSelectionToSympySpecFlow = ai.defineFlow(
    {
        name: 'convertSelectionToSympySpecFlow',
        inputSchema: ConvertSelectionToSympySpecInputSchema,
        outputSchema: SymPySpecSchema,
    },
    async (input: ConvertSelectionToSympySpecInput) => {
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

        const system =
            'You are a precise JSON API. Return ONLY a single JSON object matching the schema. ' +
            'Your output strings must be SymPy-parseable ASCII (NOT LaTeX). ' +
            'Do not include markdown fences or any extra keys. ' +
            'Return raw JSON ONLY.';

        const user = `A user highlighted some math (often extracted from KaTeX as LaTeX) and wants to run SymPy.

Your task: convert the selection into a SymPy execution spec.

IMPORTANT RULES:
- Output must be a single JSON object matching the schema.
- Expressions MUST be SymPy-parseable strings (e.g. "x**2 + 1", "sqrt(x)", "sin(x)").
- Do NOT output LaTeX commands like \\frac, \\sqrt{}, \\sin.
- Prefer implicit multiplication expanded ("2*x" not "2x").
- If the selection contains an equality like "a = b", choose op="verify" and fill lhs/rhs.
- If the selection looks like "diff ..." or "d/dx" or contains \\frac{d}{dx}, choose op="diff".
- If the selection contains an integral sign or \\int, choose op="integrate".
- If the selection is an ordinary differential equation (contains y', y'', Derivative(y(x), x), etc.), choose op="dsolve".
- If the user highlighted a plain expression, choose op="simplify".
- Only use op="solve" if it is clearly a solving request (e.g. "solve x^2=1" or "x^2=1"). Otherwise default to verify.

Selection (LaTeX-ish):
${input.selectionLatex}

Selection (plain):
${input.selectionText}

Return ONLY a JSON object and nothing else.`;

        let lastErr: any = null;
        for (const cand of candidates) {
            try {
                const { text } = await ai.generate({
                    model: cand,
                    system,
                    prompt: user,
                });

                const parsed = extractJsonObject(text || '');
                const spec = SymPySpecSchema.parse(parsed);
                return spec;
            } catch (e: any) {
                const norm = normalizeModelError(e);
                lastErr = norm;
                if (norm.code === 'MODEL_RATE_LIMIT') continue;
                throw new Error(norm.message);
            }
        }
        throw new Error((lastErr && lastErr.message) || 'Failed to convert selection to SymPy spec.');
    },
);
