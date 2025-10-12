import OpenAI from 'openai';
import Handlebars from 'handlebars';

type ZodLike<T = any> = {
    parse: (value: unknown) => T;
};

type PromptConfig = {
    name: string;
    input: { schema: ZodLike };
    output: { schema: ZodLike };
    prompt: string;
    system?: string;
};

type FlowConfig = {
    name: string;
    inputSchema: ZodLike;
    outputSchema: ZodLike;
    cache?: { ttl?: number };
};

type CacheEntry = { value: any; expiresAt: number };
const flowCache = new Map<string, CacheEntry>();

class OpenAIShim {
    private client: OpenAI;
    private model: string;

    constructor(params?: { apiKey?: string; model?: string }) {
        const apiKey = params?.apiKey ?? process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is required when using LLM_PROVIDER=openai');
        }
        this.client = new OpenAI({ apiKey });
        this.model = params?.model ?? process.env.LLM_MODEL ?? 'gpt-5-mini';
        console.info(`[AI] OpenAI shim initialized model=${this.model}`);
    }

    definePrompt<TIn = any, TOut = any>(config: PromptConfig) {
        const template = Handlebars.compile(config.prompt);
        const system = config.system;

        return async (input: TIn): Promise<{ output: TOut }> => {
            // Validate input
            const validatedInput = config.input?.schema
                ? config.input.schema.parse(input)
                : (input as any);

            // Render prompt with Handlebars (supports {{{var}}}, {{#each}} etc.)
            const userContent = template(validatedInput);

            // Keep prompt text identical across providers
            const userPrompt = userContent;
            console.info(`[AI] OpenAI prompt name=${config.name} model=${this.model}`);

            // Try model-appropriate API and keep parameters minimal for maximum compatibility
            let content: string | null = null;

            if (/^gpt-5/i.test(this.model)) {
                // GPT-5: use Responses API; request JSON output without schema (schema support varies)
                try {
                    const resp: any = await (this.client as any).responses.create({
                        model: this.model,
                        input: userPrompt,
                        ...(system ? { instructions: system } : {}),
                        // Enforce JSON output mode for newer models
                        text: { format: 'json' },
                    });

                    content = resp?.output_text ?? null;

                    // Fallback extraction for older SDK shapes
                    if (!content && Array.isArray(resp?.output)) {
                        const parts = resp.output[0]?.content;
                        const textPart =
                            Array.isArray(parts) &&
                            parts.find(
                                (p: any) =>
                                    p?.type === 'output_text' ||
                                    p?.type === 'text' ||
                                    typeof p?.text === 'string'
                            );
                        content = textPart?.text ?? null;
                    }
                } catch (e) {
                    // Fallback to minimal chat.completions if Responses API rejects parameters in this project/region
                    try {
                        const completion = await this.client.chat.completions.create({
                            model: this.model,
                            messages: [
                                ...(system ? [{ role: 'system' as const, content: system as string }] : []),
                                { role: 'user' as const, content: userPrompt },
                            ],
                        });
                        content = completion.choices?.[0]?.message?.content ?? null;
                    } catch (e2) {
                        throw new Error(
                            `OpenAI Responses API call failed for model ${this.model}: ${e instanceof Error ? e.message : String(e)}; ` +
                            `chat.completions fallback failed: ${e2 instanceof Error ? e2.message : String(e2)}`
                        );
                    }
                }
            } else {
                // Non-gpt-5: try chat.completions with JSON object enforcement where supported
                try {
                    const completion = await this.client.chat.completions.create({
                        model: this.model,
                        messages: [
                            ...(system ? [{ role: 'system' as const, content: system as string }] : []),
                            { role: 'user' as const, content: userPrompt },
                        ],
                        // Only some models support response_format=json_object
                        response_format: { type: 'json_object' as const },
                        temperature: 0.2,
                    });

                    content = completion.choices?.[0]?.message?.content ?? null;
                } catch {
                    // Fallback without response_format and extra params
                    const completion = await this.client.chat.completions.create({
                        model: this.model,
                        messages: [
                            ...(system ? [{ role: 'system' as const, content: system as string }] : []),
                            { role: 'user' as const, content: userPrompt },
                        ],
                    });
                    content = completion.choices?.[0]?.message?.content ?? null;
                }
            }

            if (!content) {
                throw new Error(
                    `OpenAI returned empty content for prompt "${config.name}".`
                );
            }

            // Parse and validate output
            let parsed: unknown;
            try {
                parsed = JSON.parse(content);
            } catch (e) {
                throw new Error(
                    `Model output was not valid JSON for prompt "${config.name}": ${content}`
                );
            }

            // Normalize common fields that should be strings but models may return as objects
            const normalized = normalizeCommonFields(parsed);

            const output = config.output?.schema
                ? (config.output.schema.parse(normalized) as TOut)
                : (normalized as TOut);

            return { output };
        };
    }

    defineFlow<TIn = any, TOut = any>(
        config: FlowConfig,
        handler: (input: TIn) => Promise<TOut>
    ) {
        const ttl = config.cache?.ttl ?? 0;

        return async (input: TIn): Promise<TOut> => {
            const validatedInput = config.inputSchema
                ? (config.inputSchema.parse(input) as TIn)
                : input;

            // Optional TTL cache similar to Genkit flow cache
            if (ttl > 0) {
                const key = `${config.name}:${this.model}:${hashJSON({
                    input: validatedInput,
                })}`;
                const now = Date.now();
                const hit = flowCache.get(key);
                if (hit && hit.expiresAt > now) {
                    return hit.value as TOut;
                }
                const result = await handler(validatedInput);
                // Validate output if schema provided
                const validatedOutput = config.outputSchema
                    ? (config.outputSchema.parse(result) as TOut)
                    : result;
                flowCache.set(key, { value: validatedOutput, expiresAt: now + ttl * 1000 });
                return validatedOutput;
            }

            const result = await handler(validatedInput);
            const validatedOutput = config.outputSchema
                ? (config.outputSchema.parse(result) as TOut)
                : result;
            return validatedOutput;
        };
    }
}

function hashJSON(obj: unknown): string {
    // Simple, stable JSON hash substitute
    const s = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return h.toString(16);
}

// Coerce common string fields into strings if models return structured objects.
function coerceToString(value: any): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    if (typeof value === 'object') {
        if (typeof value.text === 'string') return value.text;
        if (typeof value.content === 'string') return value.content;
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

// Best-effort normalization for our known schemas:
// - feedback, reasoning, explanation should be strings
// - sublemmas[].title/content and revisedSublemmas[].title/content should be strings
function normalizeCommonFields<T = any>(obj: T): T {
    if (obj && typeof obj === 'object') {
        const out: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };

        if ('feedback' in out) out.feedback = coerceToString(out.feedback);
        if ('reasoning' in out) out.reasoning = coerceToString(out.reasoning);
        if ('explanation' in out) out.explanation = coerceToString(out.explanation);

        const fixSublemmas = (arr: any[]) =>
            arr.map((s) => {
                if (s && typeof s === 'object') {
                    const t: any = { ...s };
                    if ('title' in t) t.title = coerceToString(t.title);
                    if ('content' in t) t.content = coerceToString(t.content);
                    return t;
                }
                return s;
            });

        if (Array.isArray(out.sublemmas)) out.sublemmas = fixSublemmas(out.sublemmas);
        if (Array.isArray(out.revisedSublemmas))
            out.revisedSublemmas = fixSublemmas(out.revisedSublemmas);

        return out;
    }
    return obj;
}

export function createOpenAIShim(params?: { apiKey?: string; model?: string }) {
    return new OpenAIShim(params);
}

export type AIShim = Pick<OpenAIShim, 'definePrompt' | 'defineFlow'>;
