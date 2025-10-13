'use server';
/**
 * @fileOverview Generates a dependency graph from a sequence of sublemmas.
 *
 * - generateProofGraph - A function that creates a graph structure from proof steps.
 * - GenerateProofGraphInput - The input type for the function.
 * - GenerateProofGraphOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
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
  prompt: `You are an expert in mathematical logic and graph theory. Your task is to analyze a sequence of mathematical sublemmas and construct a dependency graph representing their logical relationships.

**Input:** A list of sublemmas, each with a title and content.

**Instructions:**
1.  Create a node for each sublemma. Use "step-N" as the node ID, where N is the 1-based index of the sublemma in the input array. The node's label should be the sublemma's title.
2.  Analyze the dependencies between the sublemmas. An edge should exist from node A to node B if sublemma B directly depends on the result or statement of sublemma A.
3.  The graph should represent the logical flow. Sometimes this will be a simple linear chain (1 -> 2 -> 3), but other times a step might depend on multiple previous steps.
4.  Create DIRECTED edges connecting the nodes based on these dependencies. Edges MUST be oriented from dependency to dependent: set "source" to the step that is used (A) and "target" to the step that depends on it (B). Use "edge-S-T" as the edge ID, where S is the source step number and T is the target step number (1-based). Do not output undirected edges.

**Proof Steps to Analyze:**
{{#each proofSteps}}
- Title: {{this.title}}
  Statement: {{this.statement}}
  Proof: {{this.proof}}
{{/each}}

Based on your analysis, generate the nodes and edges for the dependency graph. Ensure your output is a valid JSON object matching the required schema. Ensure there is one node for every proof step provided.`,
});

const generateProofGraphFlow = ai.defineFlow(
  {
    name: 'generateProofGraphFlow',
    inputSchema: GenerateProofGraphInputSchema,
    outputSchema: GenerateProofGraphOutputSchema,
  },
  async (input) => {
    const { output } = await generateProofGraphPrompt(input);
    if (!output || !output.nodes || !output.edges) {
      throw new Error(
        'The AI failed to generate a valid graph structure. The response was empty or malformed.',
      );
    }
    return output;
  },
);
