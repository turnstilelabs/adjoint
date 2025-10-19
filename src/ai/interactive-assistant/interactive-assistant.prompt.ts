import { ADJOINT_SYSTEM_POLICY } from '@/ai/policy';
import { InteractiveAssistantInputSchema } from '@/ai/interactive-assistant/interactive-assistant.schemas';
import { ai } from './ai';

export const interactiveAssistantPrompt = ai.definePrompt({
  name: 'interactiveAssistantPrompt',
  input: { schema: InteractiveAssistantInputSchema },
  prompt: `${ADJOINT_SYSTEM_POLICY}

You are an expert mathematician and AI assistant embedded in an interactive proof environment.

Instructions for this turn:
- First, provide a clear, helpful natural-language answer to the user's request. Do NOT include any JSON in your text answer.
- After you finish the natural-language answer, call the tool "propose_changes" exactly once, passing the final "revisedSublemmas" array (even if empty when no changes are warranted).
- Do not include any commentary in the tool call arguments.

**Problem:**
"{{{problem}}}"

**Current Proof Steps:**
{{#each proofSteps}}
- **{{this.title}}**
  - Statement: {{this.statement}}
  - Proof: {{this.proof}}
{{/each}}


**Conversation so far**
{{#each proofSteps}}
[{{this.role}}] {{this.content}}
{{/each}}


**User's Request:**
"{{{request}}}"

Now:
1) Write your FULL natural-language answer.
2) THEN call propose_changes once with { revisedSublemmas: [{ title, statement, proof }] } representing the final proposed proof revision (use an empty array if no changes are needed). After you call propose_changes, stop and end the turn. Do not send any more text and do not call any tools again.`,
});
