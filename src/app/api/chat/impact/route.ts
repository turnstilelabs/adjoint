import { NextResponse } from 'next/server';
import { reviseProof } from '@/ai/flows/revise-proof';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';

export const runtime = 'nodejs';

type ImpactBody = {
    problem: string;
    proofSteps: Sublemma[];
    request: string;
};

export async function POST(req: Request) {
    try {
        const { problem, proofSteps, request } = (await req.json()) as Partial<ImpactBody>;

        if (!problem || !Array.isArray(proofSteps) || !request) {
            return NextResponse.json(
                { error: 'Invalid payload. Expected { problem: string, proofSteps: Sublemma[], request: string }' },
                { status: 400 }
            );
        }

        const result = await reviseProof({ problem, proofSteps, request });

        // Return only what the client needs post-stream to annotate the message.
        const payload = {
            revisionType: result.revisionType,
            revisedSublemmas: result.revisedSublemmas ?? null,
        };

        return NextResponse.json(payload, { status: 200 });
    } catch (err: any) {
        console.error('chat/impact route error:', err);
        return NextResponse.json({ error: 'Failed to run impact check.' }, { status: 500 });
    }
}
