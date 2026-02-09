'use server';

/** @fileOverview Generates a dependency graph from a sequence of proof steps. */

import { ai, getLlmId, requireLlmApiKey } from '@/ai/genkit';
import { z } from 'genkit';
import { SublemmaSchema } from './schemas';
import { env } from '@/env';
import { generateProofGraphFixture } from '@/app/actions.mocks';

const GraphNodeSchema = z.object({
  id: z.string().describe('A unique identifier for the node (e.g., "step-1").'),
  label: z.string().describe('The label for the node, typically the sublemma title.'),
});

const GraphEdgeSchema = z.object({
  id: z.string().describe('A unique identifier for the edge (e.g., "edge-1-2").'),
  source: z.string().describe('The ID of the source node.'),
  target: z.string().describe('The ID of the target node.'),
});

const GenerateProofGraphInputSchema = z.object({
  goalStatement: z.string().describe('The original input statement to be proved (the goal node).'),
  proofSteps: z.array(SublemmaSchema).describe('The sequence of sublemmas in the proof.'),
});
export type GenerateProofGraphInput = z.infer<typeof GenerateProofGraphInputSchema>;

const GenerateProofGraphOutputSchema = z.object({
  nodes: z.array(GraphNodeSchema).describe('The nodes of the dependency graph.'),
  edges: z.array(GraphEdgeSchema).describe('The edges representing dependencies between nodes.'),
});
export type GenerateProofGraphOutput = z.infer<typeof GenerateProofGraphOutputSchema>;

export async function generateProofGraph(
  input: GenerateProofGraphInput,
): Promise<GenerateProofGraphOutput> {
  if (env.USE_MOCK_API) {
    return generateProofGraphFixture;
  }
  return generateProofGraphFlow(input);
}

const generateProofGraphPrompt = ai.definePrompt({
  name: 'generateProofGraphPrompt',
  input: { schema: GenerateProofGraphInputSchema },
  output: { schema: GenerateProofGraphOutputSchema },
  prompt: `You are an expert in mathematical logic and graph theory. Your task is to construct a dependency graph representing the logical relationships between lemma statements and the final goal statement.

**Input:**
- The goal statement to be proved (the user's original statement).
- A list of sublemmas, each with a title and a statement.

**Instructions:**
1.  Create a fixed node for the GOAL statement:
    - Node id MUST be exactly "goal".
    - Node label should be something short like "Goal" or "Statement".
2.  Create a node for each sublemma. Use "step-N" as the node ID, where N is the 1-based index of the sublemma in the input array. The node's label should be the sublemma's title.
3.  IMPORTANT: Determine dependencies using ONLY the goal statement and the lemma STATEMENTS.
    - Do NOT use lemma proofs.
    - Do NOT infer dependencies based on proof text.
4.  Add edges for dependencies:
    - Add an edge A -> B if statement B uses statement A.
    - Add edges from lemma steps to the goal when the goal uses that lemma.
    - Edges MUST be oriented from dependency to dependent: set "source" to the step that is used (A) and "target" to the dependent (B).
    - Use id "edge-S-T" where S and T are node IDs (e.g. "edge-step-1-step-2" or "edge-step-3-goal").
    - Do not output undirected edges.

**Goal Statement:**
{{goalStatement}}

**Lemma Statements to Analyze (ignore proofs):**
{{#each proofSteps}}
- Title: {{this.title}}
  Statement: {{this.statement}}
{{/each}}

Based on your analysis, generate the nodes and edges for the dependency graph. Ensure your output is a valid JSON object matching the required schema. Ensure there is one node for every proof step provided PLUS the fixed goal node.`,
});

const generateProofGraphFlow = ai.defineFlow(
  {
    name: 'generateProofGraphFlow',
    inputSchema: GenerateProofGraphInputSchema,
    outputSchema: GenerateProofGraphOutputSchema,
  },
  async (input) => {
    const apiKey = requireLlmApiKey();
    const { output } = await generateProofGraphPrompt(input, {
      model: getLlmId(),
      config: { apiKey },
    } as any);
    if (!output || !output.nodes || !output.edges) {
      throw new Error(
        'The AI failed to generate a valid graph structure. The response was empty or malformed.',
      );
    }
    return output;
  },
);
