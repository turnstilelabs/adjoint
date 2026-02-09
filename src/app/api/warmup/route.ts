import { NextResponse } from 'next/server';
import { ai, getDefaultLlmId } from '@/ai/genkit';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { workspaceAssistantFlow } from '@/ai/workspace-assistant/workspace-assistant.flow';

/**
 * Best-effort warm-up route.
 *
 * Goal: reduce first-user-message latency by forcing Next.js/Genkit to load the
 * heavy modules and register provider plugins. This endpoint intentionally does
 * NOT call the LLM (no token/cost), it only touches the action objects.
 */
export async function GET() {
    // Touch exports so they are initialized.
    void ai;
    void getDefaultLlmId;
    void explorationAssistantFlow;
    void workspaceAssistantFlow;

    return NextResponse.json({ ok: true, warmed: true, llmId: getDefaultLlmId() });
}
