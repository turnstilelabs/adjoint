import { NextResponse } from 'next/server';
import { reviseProof } from '@/ai/flows/revise-proof';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';

export const runtime = 'nodejs';

type ImpactTextBody = {
  problem: string;
  proofSteps: Sublemma[];
  assistantText: string;
};

export async function POST(req: Request) {
  try {
    const { problem, proofSteps, assistantText } = (await req.json()) as Partial<ImpactTextBody>;

    if (!problem || !Array.isArray(proofSteps) || !assistantText) {
      return NextResponse.json(
        {
          error:
            'Invalid payload. Expected { problem: string, proofSteps: Sublemma[], assistantText: string }',
        },
        { status: 400 },
      );
    }

    // Reuse the same reviseProof flow, but drive it from the assistant's final message text
    const result = await reviseProof({
      problem,
      proofSteps,
      request: assistantText,
    });

    const payload = {
      revisionType: result.revisionType,
      revisedSublemmas: result.revisedSublemmas ?? null,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error('chat/impact-text route error:', err);
    return NextResponse.json(
      { error: 'Failed to reconcile impact from assistant text.' },
      { status: 500 },
    );
  }
}
