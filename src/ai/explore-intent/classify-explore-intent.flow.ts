import { z } from 'genkit';
import { ai, llmId } from '@/ai/genkit';
import { normalizeModelError } from '@/lib/model-error-core';

const ExploreIntentInputSchema = z.object({
    request: z.string().describe("The user's current message."),
    history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
        .optional()
        .describe('Recent conversation history (optional).'),
});
export type ExploreIntentInput = z.infer<typeof ExploreIntentInputSchema>;

export const ExploreIntentOutputSchema = z.object({
    intent: z.enum(['PROOF_REQUEST', 'EXPLORE']),
});
export type ExploreIntentOutput = z.infer<typeof ExploreIntentOutputSchema>;

const pickIntentModel = (): string => {
    const provider = (llmId.split('/')?.[0]) || 'unknown';

    // Keep intent classification fast/cheap and aligned with configured provider.
    // - googleai: use Flash
    // - openai: use Nano (user-selected)
    if (provider === 'openai') return 'openai/gpt-4.1-nano';
    return 'googleai/gemini-2.5-flash';
};

export const classifyExploreIntentFlow = ai.defineFlow(
    {
        name: 'classifyExploreIntentFlow',
        inputSchema: ExploreIntentInputSchema,
        outputSchema: ExploreIntentOutputSchema,
    },
    async (input: ExploreIntentInput) => {
        const model = pickIntentModel();

        const history = (input.history ?? []).slice(-6);
        const historyText = history.length
            ? history
                .map((m) => `[${m.role}] ${String(m.content || '').slice(0, 400)}`)
                .join('\n')
            : '(none)';

        const system =
            "You are a classifier for a math assistant UI. Return ONLY a single JSON object matching the schema. No markdown, no extra text.";

        const prompt = `Classify the user's message intent in an exploration chat.

Output must be one of:
- PROOF_REQUEST: the user is asking to prove/show/derive/verify a statement (even informally), or asking for a proof attempt.
- EXPLORE: the user is exploring assumptions, examples/counterexamples, truth value, reformulations, intuition, or asking clarifying questions.

Important:
- If the user asks for a counterexample, assumptions, truth value, examples, reformulation, or intuition -> EXPLORE.
- If the user asks "prove", "show that", "give a proof", "demonstrate", or equivalent -> PROOF_REQUEST.
- Short imperatives like "prove it", "show it", "prove", "show" are PROOF_REQUEST (they are requests to start a proof attempt).
- If truly ambiguous, choose EXPLORE.

Recent conversation (optional):
${historyText}

User message:
"""
${input.request}
"""`;

        // For robustness, try the selected model; if it fails due to capacity, fall back to the app default model.
        const candidates: string[] = [model];
        if (!candidates.includes(llmId)) candidates.push(llmId);

        let lastErr: any = null;
        for (const cand of candidates) {
            try {
                const { output } = await ai.generate({
                    model: cand,
                    system,
                    prompt,
                    output: { schema: ExploreIntentOutputSchema },
                });

                if (!output) throw new Error('No output from intent classifier.');
                return output;
            } catch (e: any) {
                const norm = normalizeModelError(e);
                lastErr = norm;
                // Try next candidate on capacity/rate limit.
                if (norm.code === 'MODEL_RATE_LIMIT') continue;
                // Non-capacity: stop early.
                throw new Error(norm.message || 'Failed to classify intent.');
            }
        }

        throw new Error((lastErr && lastErr.message) || 'Failed to classify intent.');
    },
);
