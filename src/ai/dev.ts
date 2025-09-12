import { config } from 'dotenv';
config();

import '@/ai/flows/interactive-questioning.ts';
import '@/ai/flows/llm-proof-decomposition.ts';
import '@/ai/flows/add-proof-step-validation.ts';