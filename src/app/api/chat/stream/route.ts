import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@/env';
import { ADJOINT_SYSTEM_POLICY } from '@/ai/policy';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';
import OpenAI from 'openai';

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
${sublemmas
        .map(
          (s, i) =>
            `- ${i + 1}. ${s.title}
  Statement: ${s.statement}
  Proof: ${s.proof}`
        )
        .join('\n')}
`
      : 'Current Proof Steps: (none provided)\n';

  // Prompt instructs: stream answer first, then make exactly one propose_changes call with the final revised steps.
  return `${ADJOINT_SYSTEM_POLICY}

You are an expert mathematician and AI assistant embedded in an interactive proof environment.

Instructions for this turn:
- Provide a clear, free-form answer. Do NOT output JSON in your natural language response.
- Never claim that changes have already been applied. Do not use phrases like "I've added", "I updated", "I applied", or "I changed".
- When proposing edits, use proposal language only, e.g., "I propose adding a new Lemma 4 …" or "Proposed change: … Would you like me to apply these changes?"
- Stay within the scope of the provided problem/proof context. If off-topic, say so briefly.

Problem:
"${problem}"

${stepsText}
${historyText}
User's new request:
"${request}"

Now respond naturally (free text). At the very end of your answer, append exactly one control frame on a new line with the following format:
[[PROPOSAL]]{"revisedSublemmas":[{"title":string,"statement":string,"proof":string}]}
Rules:
- Do not include JSON in the free-form text; only include the JSON inside the control frame.
- Emit the control frame once, after your free-form answer is complete.
- If you believe no changes are needed, emit [[PROPOSAL]]{"revisedSublemmas":[]} and nothing else after it.`;
}


export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<StreamRequest>;
    const problem = body?.problem;
    const sublemmas = body?.sublemmas;
    const requestText = body?.request;

    if (!problem || !Array.isArray(sublemmas) || !requestText) {
      return NextResponse.json(
        {
          error:
            'Invalid payload. Expected { problem: string, sublemmas: Sublemma[], request: string, history?: {role,content}[] }',
        },
        { status: 400 },
      );
    }

    const provider = process.env.LLM_PROVIDER ?? 'googleai';

    // Prepare provider-specific clients
    let googleModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
    let openaiKey: string | undefined;

    if (provider === 'openai') {
      openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return NextResponse.json({ error: 'Missing OpenAI API key.' }, { status: 500 });
      }
    } else {
      const googleKey =
        (env as any).GOOGLE_API_KEY ||
        (env as any).GEMINI_API_KEY ||
        (env as any).GOOGLE_GENAI_API_KEY;

      if (!googleKey) {
        return NextResponse.json({ error: 'Missing Google API key.' }, { status: 500 });
      }

      const genAI = new GoogleGenerativeAI(googleKey);
      const googleModelName = process.env.LLM_MODEL ?? 'gemini-2.5-flash';
      console.info(`[AI] Streaming provider=googleai model=${googleModelName}`);
      googleModel = genAI.getGenerativeModel({
        model: googleModelName,
        generationConfig: {
          temperature: 0.4,
        },
      });
    }

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

          if (provider === 'openai') {
            const client = new OpenAI({ apiKey: openaiKey! });
            let model = process.env.LLM_MODEL ?? 'gpt-5-mini';

            console.info(`[AI] Streaming provider=openai model=${model}`);

            const runOpenAI = async (useModel: string) => {
              const stream = await client.chat.completions.create({
                model: useModel,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
              });

              for await (const part of stream) {
                const delta = part.choices?.[0]?.delta?.content;
                if (delta) {
                  controller.enqueue(encoder.encode(delta));
                }
              }
            };

            try {
              await runOpenAI(model);
            } catch (primaryErr: any) {
              const fallbackModel = 'gpt-4o-mini';
              if (model !== fallbackModel) {
                try {
                  console.warn(`[AI] Streaming OPENAI primary model failed (${model}); falling back to ${fallbackModel}`);
                  await runOpenAI(fallbackModel);
                } catch (fallbackErr: any) {
                  const msg = typeof fallbackErr?.message === 'string' ? fallbackErr.message : 'Streaming failed.';
                  controller.enqueue(encoder.encode(`\n\n[Streaming error] ${msg}`));
                }
              } else {
                const msg = typeof primaryErr?.message === 'string' ? primaryErr.message : 'Streaming failed.';
                controller.enqueue(encoder.encode(`\n\n[Streaming error] ${msg}`));
              }
            }

            controller.close();
          } else {
            // Google (Gemini) streaming (no tools): stream text first
            const result = await googleModel!.generateContentStream({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            for await (const chunk of result.stream as any) {
              const text = chunk?.text?.();
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            }

            controller.close();
          }
        } catch (err: any) {
          const msg = typeof err?.message === 'string' ? err.message : 'Streaming failed.';
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
