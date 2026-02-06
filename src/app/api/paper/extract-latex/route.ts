import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '@/env';

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
    try {
        if (!env.OPENAI_API_KEY) {
            return NextResponse.json(
                { ok: false, error: 'OpenAI API key is not configured.' },
                { status: 500 },
            );
        }

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

        const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

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

        const models = ['gpt-5-mini', 'gpt-4o-mini'];
        let lastErr: any = null;

        for (const model of models) {
            try {
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

                return NextResponse.json({ ok: true, latex, model });
            } catch (e: any) {
                lastErr = e;
                // Try next fallback.
                continue;
            }
        }

        const msg = String(lastErr?.message || lastErr || 'Failed to extract LaTeX from image.');
        return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    } catch (e: any) {
        const msg = String(e?.message || e || 'Unexpected error');
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
