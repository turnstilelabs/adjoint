import { z } from 'zod';

// Supported providers (extend as needed)
const ProviderSchema = z.enum(['googleai', 'openai']);

// Centralized environment validation. Throws at startup if required vars are missing.
const BaseEnvSchema = z
  .object({
    // Provider selection and model
    LLM_PROVIDER: ProviderSchema.optional(), // default applied below
    LLM_MODEL: z.string().min(1).optional(),

    // API keys for supported providers
    GEMINI_API_KEY: z.string().min(1).optional(),
    GOOGLE_API_KEY: z.string().min(1).optional(),
    GOOGLE_GENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),

    // Mock mode toggle (from main)
    USE_MOCK_API: z
      .enum(['TRUE', 'FALSE'])
      .optional()
      .transform((v) => v === 'TRUE'),

    /**
     * Debug: when TRUE, log full LLM prompts for server-side flows.
     * WARNING: may contain sensitive user content.
     */
    DEBUG_LLM_PROMPTS: z
      .enum(['TRUE', 'FALSE'])
      .optional()
      .transform((v) => v === 'TRUE'),

    /**
     * Optional unlock gate for internet deployments.
     *
     * Defaults:
     * - development: disabled
     * - production: enabled
     *
     * You can override with:
     * - APP_UNLOCK_ENABLED=TRUE  (force on)
     * - APP_UNLOCK_ENABLED=FALSE (force off)
     */
    APP_UNLOCK_ENABLED: z
      .enum(['TRUE', 'FALSE'])
      .optional()
      .transform((v) => v === 'TRUE'),

    /**
     * Password for the optional unlock gate.
     *
     * NOTE: not validated here because whether it's required depends on
     * APP_UNLOCK_ENABLED and NODE_ENV.
     */
    APP_UNLOCK_PASSWORD: z.string().min(1).optional(),
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
