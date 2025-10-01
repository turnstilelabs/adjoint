import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { env } from '@/env';

void env;
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash',
});
