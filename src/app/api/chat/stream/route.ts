import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@/env';
import { ADJOINT_SYSTEM_POLICY } from '@/ai/policy';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';

export const runtime = 'nodejs';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

type StreamRequest = {
    problem: string;
    sublemmas: Sublemma[];
    request: string;
    history?: ChatHistoryItem[];
};

function buildPrompt(input: StreamRequest) {
    const { problem, sublemmas, request, history = [] } = input;

    const historyText =
        history.length > 0
            ? `Conversation so far:
${history
                .slice(-8)
                .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n')}

`
            : '';

    const stepsText =
        sublemmas.length > 0
            ? `Current Proof Steps:
${sublemmas.map((s, i) => `- ${i + 1}. ${s.title}: ${s.content}`).join('\n')}
`
            : 'Current Proof Steps: (none provided)\n';

    // Free-form, non-JSON output for streaming. We still keep the same policy constraints.
    return `${ADJOINT_SYSTEM_POLICY}

You are an expert mathematician and AI assistant embedded in an interactive proof environment.

Instructions for this turn:
- Provide a clear, free-form answer. Do NOT output JSON.
- Never claim that changes have already been applied. Do not use phrases like "I've added", "I updated", "I applied", or "I changed".
- When proposing edits, use proposal language only, e.g., "I propose adding a new Lemma 4 …" or "Proposed change: … Would you like me to apply these changes?"
- Stay within the scope of the provided problem/proof context. If off-topic, say so briefly.

Problem:
"${problem}"

${stepsText}
${historyText}
User's new request:
"${request}"

Now respond naturally (free text).`;
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Partial<StreamRequest>;
        const problem = body?.problem;
        const sublemmas = body?.sublemmas;
        const requestText = body?.request;

        if (!problem || !Array.isArray(sublemmas) || !requestText) {
            return NextResponse.json(
                { error: 'Invalid payload. Expected { problem: string, sublemmas: Sublemma[], request: string, history?: {role,content}[] }' },
                { status: 400 }
            );
        }

        const apiKey =
            (env as any).GOOGLE_API_KEY ||
            (env as any).GEMINI_API_KEY ||
            (env as any).GOOGLE_GENAI_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ error: 'Missing Google API key.' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        // Use a fast, streaming-capable model
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 0.4,
            },
        });

        const prompt = buildPrompt({
            problem,
            sublemmas,
            request: requestText,
            history: (body.history as ChatHistoryItem[]) || [],
        });

        const encoder = new TextEncoder();

        const streamingResponse = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    const result = await model.generateContentStream({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    });

                    for await (const chunk of result.stream) {
                        const text = chunk?.text();
                        if (text) {
                            controller.enqueue(encoder.encode(text));
                        }
                    }
                    controller.close();
                } catch (err: any) {
                    // Surface an inline error marker to the client stream, then close.
                    const msg =
                        typeof err?.message === 'string'
                            ? err.message
                            : 'Streaming failed.';
                    controller.enqueue(encoder.encode(`\n\n[Streaming error] ${msg}`));
                    controller.close();
                }
            },
            cancel() {
                // If the client disconnects/aborts, the stream is canceled.
            },
        });

        return new Response(streamingResponse, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store',
            },
        });
    } catch (err: any) {
        console.error('chat/stream route error:', err);
        return NextResponse.json({ error: 'Failed to stream AI response.' }, { status: 500 });
    }
}
