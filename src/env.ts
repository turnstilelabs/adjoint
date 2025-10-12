import { z } from 'zod';

// Supported providers (extend as needed)
const ProviderSchema = z.enum(['googleai', 'openai']);

// Centralized environment validation. Throws at startup if required vars are missing.
const BaseEnvSchema = z
    .object({
        // Provider selection and model
        LLM_PROVIDER: ProviderSchema.optional(), // default applied below
        LLM_MODEL: z.string().min(1).optional(),

        // Google / Gemini keys (any one works)
        GEMINI_API_KEY: z.string().min(1).optional(),
        GOOGLE_API_KEY: z.string().min(1).optional(),
        GOOGLE_GENAI_API_KEY: z.string().min(1).optional(),

        // OpenAI key
        OPENAI_API_KEY: z.string().min(1).optional(),
    })
    .passthrough();

// Provider-aware refinement
const EnvSchema = BaseEnvSchema.superRefine((e, ctx) => {
    const provider = (e.LLM_PROVIDER ?? 'googleai').toLowerCase();

    if (provider === 'googleai') {
        if (!(e.GEMINI_API_KEY || e.GOOGLE_API_KEY || e.GOOGLE_GENAI_API_KEY)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['GEMINI_API_KEY'],
                message:
                    'For LLM_PROVIDER=googleai, one of GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENAI_API_KEY is required',
            });
        }
    } else if (provider === 'openai') {
        if (!e.OPENAI_API_KEY) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['OPENAI_API_KEY'],
                message: 'For LLM_PROVIDER=openai, OPENAI_API_KEY is required',
            });
        }
    } else {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['LLM_PROVIDER'],
            message: `Unsupported LLM_PROVIDER "${provider}". Supported: googleai, openai`,
        });
    }
});

export type Env = z.infer<typeof EnvSchema> & {
    LLM_PROVIDER?: 'googleai' | 'openai';
};

// Parse and validate process.env once and export strongly-typed env
export const env = EnvSchema.parse(process.env);
