import { config } from 'dotenv';
config();

import '@/ai/flows/interactive-questioning.ts';
import '@/ai/flows/llm-proof-decomposition.ts';
import '@/ai/flows/validate-statement.ts';
import '@/ai/flows/validate-proof.ts';
import '@/ai/flows/generate-proof-graph.ts';
