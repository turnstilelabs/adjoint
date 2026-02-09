import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getLlmContextFromRequest, runWithLlmContext } from '@/ai/llm-context';
import { getLlmModel, getLlmProvider, requireLlmApiKey } from '@/ai/genkit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
    imageDataUrl: z.string().min(1),
    hint: z.string().optional(),
});

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB

function stripLatexFences(s: string): string {
    const t = String(s ?? '').trim();
    if (!t) return '';
    return t
        .replace(/^```(?:latex|tex)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
}

function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
    const s = String(dataUrl ?? '').trim();
    const m = s.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error('Invalid image data URL.');
    const mime = m[1] || 'application/octet-stream';
    const base64 = m[2] || '';
    if (!base64) throw new Error('Empty image payload.');
    return { mime, base64 };
}

function estimateBase64Bytes(b64: string): number {
    // 4/3 overhead; ignore padding minor differences.
    return Math.floor((b64.length * 3) / 4);
}

export async function POST(req: NextRequest) {
    const ctx = getLlmContextFromRequest(req);
    return runWithLlmContext(ctx, async () => {
        try {
            const json = await req.json().catch(() => null);
            const parsedInput = InputSchema.safeParse(json);
            if (!parsedInput.success) {
                return NextResponse.json({ ok: false, error: 'Invalid input.' }, { status: 400 });
            }

            const { imageDataUrl, hint } = parsedInput.data;
            const { mime, base64 } = parseDataUrl(imageDataUrl);
            if (!mime.startsWith('image/')) {
                return NextResponse.json(
                    { ok: false, error: `Unsupported mime type: ${mime}` },
                    { status: 400 },
                );
            }

            const approxBytes = estimateBase64Bytes(base64);
            if (approxBytes > MAX_IMAGE_BYTES) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: `Selected region image is too large (> ${Math.round(
                            MAX_IMAGE_BYTES / (1024 * 1024),
                        )}MB). Please select a smaller region.`,
                    },
                    { status: 413 },
                );
            }

            const provider = getLlmProvider();
            const selectedModel = getLlmModel();
            const apiKey = requireLlmApiKey();

            console.info('[extract-latex] request', {
                bytes: approxBytes,
                hint: Boolean(hint && hint.trim().length > 0),
                provider,
            });

            const system =
                'You are a LaTeX transcription engine for math papers. ' +
                'You will be given an image snippet from a PDF. ' +
                'Return ONLY LaTeX representing the mathematical content in the image. ' +
                'No prose, no markdown fences, no explanations.';

            const userText =
                `Task: transcribe the snippet into LaTeX.\n` +
                `Rules:\n` +
                `- Output ONLY LaTeX (no commentary).\n` +
                `- Preserve math faithfully (fractions, subscripts, theorem environments if visible).\n` +
                `- If the snippet contains multiple aligned equations, prefer an align/aligned environment.\n` +
                `- If you are unsure about a symbol, make a best-effort guess.\n` +
                (hint ? `\nUser question / hint: ${hint}\n` : '');

            const isOpenAiVisionModel = (model: string) =>
                /gpt-4o|gpt-4\.1|gpt-5|o[34]/i.test(model);
            const isGeminiVisionModel = (model: string) => /gemini-(1\.5|2\.5)/i.test(model);

            if (provider === 'openai') {
                const client = new OpenAI({ apiKey });
                const fallbacks: string[] = [];
                if (isOpenAiVisionModel(selectedModel)) {
                    fallbacks.push(selectedModel);
                } else {
                    fallbacks.push('gpt-4o-mini');
                }
                if (!fallbacks.includes('gpt-4o-mini')) fallbacks.push('gpt-4o-mini');

                let lastErr: any = null;
                for (const model of fallbacks) {
                    try {
                        console.info('[extract-latex] calling model', { model });
                        const resp = await client.responses.create({
                            model,
                            input: [
                                {
                                    role: 'system',
                                    content: [{ type: 'input_text', text: system }],
                                },
                                {
                                    role: 'user',
                                    content: [
                                        { type: 'input_text', text: userText },
                                        { type: 'input_image', image_url: imageDataUrl },
                                    ],
                                },
                            ],
                        } as any);

                        const text = (resp as any).output_text as string | undefined;
                        const latex = stripLatexFences(text || '');
                        if (!latex.trim()) throw new Error('Model returned empty LaTeX.');

                        console.info('[extract-latex] success', { model, chars: latex.length });
                        return NextResponse.json({ ok: true, latex, model, provider });
                    } catch (e: any) {
                        lastErr = e;
                        console.warn('[extract-latex] model error', {
                            model,
                            message: String(e?.message || e || 'Unknown error'),
                        });
                        continue;
                    }
                }
                const msg = String(lastErr?.message || lastErr || 'Failed to extract LaTeX from image.');
                return NextResponse.json({ ok: false, error: msg }, { status: 502 });
            }

            if (provider === 'googleai') {
                const genAI = new GoogleGenerativeAI(apiKey);
                const fallbacks: string[] = [];
                if (isGeminiVisionModel(selectedModel)) {
                    fallbacks.push(selectedModel);
                } else {
                    fallbacks.push('gemini-2.5-flash');
                }
                if (!fallbacks.includes('gemini-2.5-flash')) fallbacks.push('gemini-2.5-flash');
                if (!fallbacks.includes('gemini-2.5-pro')) fallbacks.push('gemini-2.5-pro');

                let lastErr: any = null;
                for (const model of fallbacks) {
                    try {
                        console.info('[extract-latex] calling model', { model });
                        const gemini = genAI.getGenerativeModel({ model });
                        const resp = await gemini.generateContent([
                            { text: system },
                            { text: userText },
                            {
                                inlineData: {
                                    mimeType: mime,
                                    data: base64,
                                },
                            },
                        ]);

                        const text = resp.response.text();
                        const latex = stripLatexFences(text || '');
                        if (!latex.trim()) throw new Error('Model returned empty LaTeX.');

                        console.info('[extract-latex] success', { model, chars: latex.length });
                        return NextResponse.json({ ok: true, latex, model, provider });
                    } catch (e: any) {
                        lastErr = e;
                        console.warn('[extract-latex] model error', {
                            model,
                            message: String(e?.message || e || 'Unknown error'),
                        });
                        continue;
                    }
                }
                const msg = String(lastErr?.message || lastErr || 'Failed to extract LaTeX from image.');
                return NextResponse.json({ ok: false, error: msg }, { status: 502 });
            }

            return NextResponse.json(
                { ok: false, error: `Provider ${provider} is not supported for image extraction.` },
                { status: 400 },
            );
        } catch (e: any) {
            const msg = String(e?.message || e || 'Unexpected error');
            return NextResponse.json({ ok: false, error: msg }, { status: 500 });
        }
    });
}
