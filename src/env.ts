import { z } from 'genkit';

// Centralized environment validation. Throws at startup if required vars are missing.
const BaseEnvSchema = z
    .object({
        // Accept any of these, require at least one to be present.
        GEMINI_API_KEY: z.string().min(1).optional(),
        GOOGLE_API_KEY: z.string().min(1).optional(),
        GOOGLE_GENAI_API_KEY: z.string().min(1).optional(),
    })
    .passthrough();

const EnvSchema = BaseEnvSchema.refine(
    (e) =>
        Boolean(e.GEMINI_API_KEY || e.GOOGLE_API_KEY || e.GOOGLE_GENAI_API_KEY),
    {
        message:
            'One of GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENAI_API_KEY is required',
    }
);

export type Env = z.infer<typeof EnvSchema>;

// Parse and validate process.env once and export strongly-typed env
export const env = EnvSchema.parse(process.env);
