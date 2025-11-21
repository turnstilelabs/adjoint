import { NextRequest } from 'next/server';
import { env } from '@/env';
import { classifyProofDraft } from '@/ai/flows/classify-proof-draft';
import { decomposeRawProof, type DecomposeRawProofOutput } from '@/ai/flows/decompose-raw-proof';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseEvent(name: string, data?: unknown) {
    const payload = data !== undefined ? `data: ${JSON.stringify(data)}\n` : '';
    return `event: ${name}\n${payload}\n`;
}
function sseComment(comment: string) {
    return `:${comment}\n\n`;
}

function getProviderAndModel() {
    const provider = (env.LLM_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'googleai')) as 'openai' | 'googleai';
    const model = env.LLM_MODEL ?? (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-flash-latest');
    return { provider, model };
}

async function streamOpenAI(model: string, problem: string, onDelta: (t: string) => void, signal: AbortSignal) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const sys =
        'You are a rigorous mathematician. Produce a complete, self-contained proof. If the original statement is not provable as posed, write a correct proof for the closest provable variant instead. Write narrative paragraphs; LaTeX allowed.';
    const user = `Prove the following statement or the closest provable variant, writing a rigorous proof.\n\n"${problem}"`;

    const stream = await openai.chat.completions.create({
        model,
        stream: true,
        messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user },
        ],
    });

    let full = '';
    // The SDK returns an async iterable of chunks
    for await (const chunk of stream as any) {
        const c = chunk?.choices?.[0]?.delta?.content;
        if (typeof c === 'string' && c.length > 0) {
            full += c;
            onDelta(c);
        }
    }
    return full;
}

async function streamGemini(model: string, problem: string, onDelta: (t: string) => void, signal: AbortSignal) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) throw new Error('Missing Google Generative AI API key');

    const genAI = new GoogleGenerativeAI(apiKey);
    const sys =
        'You are a rigorous mathematician. Produce a complete, self-contained proof. If the original statement is not provable as posed, write a correct proof for the closest provable variant instead. Write narrative paragraphs; LaTeX allowed.';
    const user = `Prove the following statement or the closest provable variant, writing a rigorous proof.\n\n"${problem}"`;

    const m = genAI.getGenerativeModel({ model, systemInstruction: sys });
    const result = await m.generateContentStream({
        contents: [
            {
                role: 'user',
                parts: [{ text: user }],
            },
        ],
    });

    let full = '';
    for await (const item of (result as any).stream) {
        const text = item?.text?.();
        if (typeof text === 'string' && text.length > 0) {
            full += text;
            onDelta(text);
        }
    }
    return full;
}

async function streamGeminiWithFallback(preferredModel: string, problem: string, onDelta: (t: string) => void, signal: AbortSignal) {
    const tried: string[] = [];

    // Build candidate list: env override first, then known aliases, then dynamically discovered models
    const baseCandidates = [
        preferredModel,
        'gemini-flash-latest',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash-8b',
        'gemini-1.5-flash',
    ].filter(Boolean) as string[];

    let dynamicFlash: string[] = [];
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
        if (apiKey) {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (resp.ok) {
                const data: any = await resp.json();
                const models: any[] = (data?.models || data?.result || []).filter(Boolean);
                dynamicFlash = models
                    .filter((m) => {
                        const name = String(m?.name || '');
                        if (!name.includes('flash')) return false;
                        const methods = (m?.generationMethods || m?.supportedGenerationMethods || m?.supported_methods || []) as string[];
                        // Accept models that support generateContent or streamGenerateContent
                        return Array.isArray(methods)
                            ? methods.some((x) => typeof x === 'string' && (x.includes('generateContent') || x.includes('streamGenerateContent')))
                            : true;
                    })
                    .map((m) => String(m.name))
                    // Heuristic: prefer global aliases and latest first
                    .sort((a, b) => {
                        const score = (s: string) => (
                            (s.includes('flash-latest') ? 4 : 0) +
                            (s.includes('gemini-flash-latest') ? 4 : 0) +
                            (s.endsWith('-latest') ? 2 : 0) +
                            (s.endsWith('-001') ? 1 : 0)
                        );
                        return score(b) - score(a);
                    });
            }
        }
    } catch (e) {
        // ignore dynamic discovery errors; we still have static fallbacks
    }

    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const m of [...baseCandidates, ...dynamicFlash]) {
        if (!m) continue;
        if (seen.has(m)) continue;
        seen.add(m);
        candidates.push(m);
    }

    let lastErr: any = null;
    for (const m of candidates) {
        tried.push(m);
        try {
            const text = await streamGemini(m, problem, onDelta, signal);
            return { text, usedModel: m, tried };
        } catch (e: any) {
            lastErr = e;
            continue;
        }
    }
    const err = new Error(`All Gemini model candidates failed: ${tried.join(' -> ')}. Last error: ${lastErr?.message || lastErr}`);
    (err as any).tried = tried;
    throw err;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const problem = searchParams.get('problem')?.toString() ?? '';

    if (!problem.trim()) {
        return new Response('Missing problem', { status: 400 });
    }

    const encoder = new TextEncoder();
    let keepalive: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
            const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
            const close = () => controller.close();
            const error = (e: unknown) => controller.error(e);

            try {
                keepalive = setInterval(() => {
                    try { write(sseComment('keepalive')); } catch { }
                }, 15000);

                const { provider, model } = getProviderAndModel();
                write(sseEvent('model.start', { provider, model, ts: Date.now() }));

                const t0 = Date.now();
                let fullDraft = '';
                const onDelta = (t: string) => write(sseEvent('model.delta', { text: t }));

                try {
                    if (provider === 'openai') {
                        fullDraft = await streamOpenAI(model, problem, onDelta, req.signal);
                    } else {
                        const { text, usedModel } = await streamGeminiWithFallback(model, problem, onDelta, req.signal);
                        fullDraft = text;
                        if (usedModel !== model) {
                            try { write(sseEvent('model.switch', { to: usedModel })); } catch { }
                        }
                    }
                } catch (e: any) {
                    write(sseEvent('server-error', { success: false, error: e?.message || 'Streaming failed.' }));
                    close();
                    return;
                }

                const durationMs = Date.now() - t0;
                write(sseEvent('model.end', { durationMs, length: fullDraft.length }));

                // Classification
                write(sseEvent('classify.start', { ts: Date.now() }));
                let attempt: any;
                try {
                    const result = await classifyProofDraft({ problem, rawProof: fullDraft });
                    attempt = { ...result, rawProof: fullDraft };
                    write(sseEvent('classify.result', result));
                } catch (e: any) {
                    write(sseEvent('server-error', { success: false, error: 'Failed to classify draft.' }));
                    write(sseEvent('done', { success: true, attempt: { status: 'FAILED', finalStatement: null, variantType: null, rawProof: fullDraft, explanation: 'Failed to classify drafted proof.' }, decompose: null }));
                    close();
                    return;
                }

                // If failed, end early without decomposition
                if (attempt.status === 'FAILED') {
                    write(sseEvent('done', { success: true, attempt, decompose: null }));
                    close();
                    return;
                }

                // Decomposition
                write(sseEvent('decompose.start', { ts: Date.now() }));
                let decomp: DecomposeRawProofOutput | null = null;
                try {
                    decomp = await decomposeRawProof({ rawProof: fullDraft });
                    write(sseEvent('decompose.result', { sublemmasCount: decomp.sublemmas?.length ?? 0, provedLen: decomp.provedStatement?.length ?? 0, normLen: decomp.normalizedProof?.length ?? 0 }));
                } catch (e) {
                    write(sseEvent('server-error', { success: false, error: 'Failed to decompose drafted proof.' }));
                }

                write(sseEvent('done', { success: true, attempt, decompose: decomp }));
                close();
            } catch (e: any) {
                try { write(sseEvent('server-error', { success: false, error: e?.message || 'Unexpected error in attempt-stream.' })); } catch { }
                error(e);
            }
        },
        cancel: () => {
            if (keepalive) clearInterval(keepalive);
        },
    });

    req.signal.addEventListener('abort', () => { if (keepalive) clearInterval(keepalive); });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
