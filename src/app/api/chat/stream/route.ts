import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
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

// Shared tool/function schema for both providers
const PROPOSE_CHANGES_SCHEMA = {
  name: 'propose_changes',
  description:
    'Return the final revised list of sublemmas for the proof. Do not include commentary; only the structured revised steps.',
  parameters: {
    type: 'object',
    properties: {
      revisedSublemmas: {
        type: 'array',
        description: 'Final revised sublemma steps in order',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            statement: { type: 'string' },
            proof: { type: 'string' },
          },
          required: ['title', 'statement', 'proof'],
          additionalProperties: false,
        },
      },
    },
    required: ['revisedSublemmas'],
    additionalProperties: false,
  },
} as const;

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
  Proof: ${s.proof}`,
        )
        .join('\n')}
`
      : 'Current Proof Steps: (none provided)\n';

  // No control frames. We will use function/tool calling in the same request.
  return `${ADJOINT_SYSTEM_POLICY}

You are an expert mathematician and AI assistant embedded in an interactive proof environment.

Instructions for this turn:
- First, provide a clear, helpful natural-language answer to the user's request. Do NOT include any JSON in your text answer.
- After you finish the natural-language answer, call the tool "propose_changes" exactly once, passing the final "revisedSublemmas" array (even if empty when no changes are warranted).
- Do not include any commentary in the tool call arguments.

Problem:
"${problem}"

${stepsText}
${historyText}
User's new request:
"${request}"

Now:
1) Write your full natural-language answer.
2) Then call propose_changes with { revisedSublemmas: [{ title, statement, proof }] } representing the final proposed proof revision (use an empty array if no changes are needed).`;
}

function safeParseJSON<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
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
        const write = (obj: unknown) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        const sendProposal = (revised: unknown) => {
          const arr = Array.isArray(revised) ? (revised as unknown[]) : [];
          write({ type: 'proposal', revisedSublemmas: arr });
        };

        try {
          if (provider === 'openai') {
            const client = new OpenAI({ apiKey: openaiKey! });
            let model = process.env.LLM_MODEL ?? 'gpt-5-mini';
            console.info(`[AI] Streaming provider=openai model=${model}`);

            const tools = [
              {
                type: 'function' as const,
                function: PROPOSE_CHANGES_SCHEMA,
              },
            ];

            const messages = [
              { role: 'system' as const, content: ADJOINT_SYSTEM_POLICY },
              { role: 'user' as const, content: prompt },
            ];

            const runOpenAI = async (useModel: string) => {
              const stream = await client.chat.completions.create({
                model: useModel,
                messages,
                tools,
                // Let the model decide when to call the tool (instructed to do it after text).
                stream: true,
              });

              // Accumulate function call args for the first propose_changes call we see
              let toolArgsBuffer = '';

              for await (const part of stream) {
                const choice = part.choices?.[0];
                const delta = choice?.delta;
                if (delta?.content) {
                  write({ type: 'text', content: delta.content });
                }
                const tcs = delta?.tool_calls;
                if (Array.isArray(tcs)) {
                  for (const tc of tcs) {
                    if (tc?.function?.name === PROPOSE_CHANGES_SCHEMA.name && tc.function?.arguments) {
                      toolArgsBuffer += tc.function.arguments;
                    }
                  }
                }
              }

              if (toolArgsBuffer.trim().length > 0) {
                const parsed = safeParseJSON<{ revisedSublemmas?: Sublemma[] }>(toolArgsBuffer) || {
                  revisedSublemmas: [],
                };
                sendProposal(parsed.revisedSublemmas ?? []);
              } else {
                // If no tool call came through, fallback to noImpact
                sendProposal([]);
              }
            };

            try {
              await runOpenAI(model);
            } catch (primaryErr: any) {
              const fallbackModel = 'gpt-4o-mini';
              if (model !== fallbackModel) {
                try {
                  console.warn(
                    `[AI] Streaming OPENAI primary model failed (${model}); falling back to ${fallbackModel}`,
                  );
                  await runOpenAI(fallbackModel);
                } catch (fallbackErr: any) {
                  const msg =
                    typeof fallbackErr?.message === 'string'
                      ? fallbackErr.message
                      : 'Streaming failed.';
                  write({ type: 'error', message: msg });
                }
              } else {
                const msg =
                  typeof primaryErr?.message === 'string'
                    ? primaryErr.message
                    : 'Streaming failed.';
                write({ type: 'error', message: msg });
              }
            }

            write({ type: 'done' });
            controller.close();
          } else {
            // Google (Gemini) streaming with functionDeclarations in one call
            const req: any = {
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              tools: {
                functionDeclarations: [
                  {
                    name: PROPOSE_CHANGES_SCHEMA.name,
                    description: PROPOSE_CHANGES_SCHEMA.description,
                    parameters: PROPOSE_CHANGES_SCHEMA.parameters,
                  },
                ],
              },
            };

            const result = await googleModel!.generateContentStream(req);

            // Stream text chunks
            for await (const chunk of (result as any).stream) {
              const text = chunk?.text?.();
              if (text) {
                write({ type: 'text', content: text });
              }
            }

            // After stream ends, read the final response to extract the function call
            try {
              const final = await (result as any).response;
              const candidates: any[] = final?.candidates || [];
              let revised: Sublemma[] | null = null;

              for (const cand of candidates) {
                const parts: any[] = cand?.content?.parts || [];
                for (const p of parts) {
                  const fc = p?.functionCall;
                  if (fc?.name === PROPOSE_CHANGES_SCHEMA.name) {
                    // Gemini provides structured args; they may already be parsed
                    const args = fc.args ?? {};
                    const arr = Array.isArray(args?.revisedSublemmas) ? args.revisedSublemmas : [];
                    revised = arr;
                    break;
                  }
                }
                if (revised) break;
              }

              if (!revised) revised = [];
              sendProposal(revised);
            } catch {
              // If we cannot extract a function call, fallback to noImpact
              sendProposal([]);
            }

            write({ type: 'done' });
            controller.close();
          }
        } catch (err: any) {
          const msg = typeof err?.message === 'string' ? err.message : 'Streaming failed.';
          try {
            write({ type: 'error', message: msg });
            write({ type: 'done' });
          } finally {
            controller.close();
          }
        }
      },
      cancel() {
        // If the client disconnects/aborts, the stream is canceled.
      },
    });

    return new Response(streamingResponse, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('chat/stream route error:', err);
    return NextResponse.json({ error: 'Failed to stream AI response.' }, { status: 500 });
  }
}
