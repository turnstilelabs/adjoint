import { config } from 'dotenv';
import '@/ai/flows/llm-proof-decomposition.ts';
import '@/ai/flows/validate-statement.ts';
import '@/ai/flows/validate-proof.ts';
import '@/ai/flows/validate-raw-proof.ts';
import '@/ai/flows/generate-proof-graph.ts';

config();
