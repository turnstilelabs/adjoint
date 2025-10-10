import { NextResponse } from 'next/server';
import { validateProof } from '@/ai/flows/validate-proof';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';

type RequestBody = {
  problem: string;
  proofSteps: Sublemma[];
};

export async function POST(req: Request) {
  try {
    const { problem, proofSteps } = (await req.json()) as Partial<RequestBody>;

    if (!problem || !Array.isArray(proofSteps)) {
      return NextResponse.json(
        {
          error: 'Invalid payload. Expected { problem: string, proofSteps: Sublemma[] }',
        },
        { status: 400 },
      );
    }

    const result = await validateProof({ problem, proofSteps });

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // Client aborted the request
      return new Response(null, {
        status: 499,
        statusText: 'Client Closed Request',
      });
    }
    console.error('validate-proof route error:', err);
    return NextResponse.json({ error: 'Failed to validate the proof with AI.' }, { status: 500 });
  }
}
