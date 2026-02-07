import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import * as tar from 'tar';
import { parseArxivId, arxivEprintUrl } from '@/lib/arxiv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
    urlOrId: z.string().min(1),
});

// Safety limits (best-effort)
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TEX_BYTES_TOTAL = 5 * 1024 * 1024;

type TexFile = { path: string; content: string };

function pickMainTex(files: TexFile[]): TexFile | null {
    if (files.length === 0) return null;

    // Prefer explicit main.tex
    const main = files.find((f) => /(^|\/)main\.tex$/i.test(f.path));
    if (main) return main;

    // Prefer any file containing \documentclass
    const docClass = files.find((f) => /\\documentclass\b/.test(f.content));
    if (docClass) return docClass;

    // Otherwise largest tex file.
    return [...files].sort((a, b) => b.content.length - a.content.length)[0] ?? null;
}

export async function POST(req: NextRequest) {
    try {
        const json = await req.json().catch(() => null);
        const parsedInput = InputSchema.safeParse(json);
        if (!parsedInput.success) {
            return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 });
        }

        const urlOrId = parsedInput.data.urlOrId;
        const parsed = parseArxivId(urlOrId);
        if (!parsed) {
            return NextResponse.json(
                { ok: false, error: 'Could not parse arXiv id from input.' },
                { status: 400 },
            );
        }

        const eprintUrl = arxivEprintUrl(parsed);

        // Download the tarball (usually a .tar.gz)
        const resp = await fetch(eprintUrl, {
            // Avoid caching in dev; also arXiv may vary by edge.
            cache: 'no-store',
            redirect: 'follow',
        });

        if (!resp.ok || !resp.body) {
            return NextResponse.json(
                { ok: false, error: `Failed to download arXiv sources (HTTP ${resp.status})` },
                { status: 502 },
            );
        }

        const lenHeader = resp.headers.get('content-length');
        if (lenHeader) {
            const n = Number(lenHeader);
            if (Number.isFinite(n) && n > MAX_DOWNLOAD_BYTES) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: `arXiv source bundle too large (> ${Math.round(
                            MAX_DOWNLOAD_BYTES / (1024 * 1024),
                        )}MB).`,
                    },
                    { status: 413 },
                );
            }
        }

        const warnings: string[] = [];
        const texFiles: TexFile[] = [];
        let totalTexBytes = 0;

        // Buffer the source bundle (we enforce MAX_DOWNLOAD_BYTES via content-length when present).
        const srcBuf = Buffer.from(await resp.arrayBuffer());
        if (srcBuf.length > MAX_DOWNLOAD_BYTES) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `arXiv source bundle too large (> ${Math.round(
                        MAX_DOWNLOAD_BYTES / (1024 * 1024),
                    )}MB).`,
                },
                { status: 413 },
            );
        }

        // arXiv e-print bundles are commonly gzip-compressed. Detect by magic bytes.
        const isGzip = srcBuf.length >= 2 && srcBuf[0] === 0x1f && srcBuf[1] === 0x8b;
        const tarBuf = isGzip ? Buffer.from(gunzipSync(srcBuf)) : srcBuf;

        // Parse tarball in-memory, collecting .tex entries.
        await new Promise<void>((resolve, reject) => {
            let exceeded = false;

            const listing = (tar as any).t({
                onentry: (entry: any) => {
                    const p = String(entry.path ?? '');
                    const isTex = /\.tex$/i.test(p);
                    if (!isTex || exceeded) {
                        try {
                            entry.resume();
                        } catch {
                            // ignore
                        }
                        return;
                    }

                    const chunks: Buffer[] = [];
                    entry.on('data', (c: Buffer) => chunks.push(c));
                    entry.on('end', () => {
                        if (exceeded) return;
                        try {
                            const buf = Buffer.concat(chunks);
                            totalTexBytes += buf.length;
                            if (totalTexBytes > MAX_TEX_BYTES_TOTAL) {
                                exceeded = true;
                                warnings.push('Extracted TeX too large; truncated file list.');
                                try {
                                    listing.destroy();
                                } catch {
                                    // ignore
                                }
                                return;
                            }
                            texFiles.push({ path: p, content: buf.toString('utf8') });
                        } catch {
                            warnings.push(`Failed to decode ${p}`);
                        }
                    });
                },
            });

            listing.on('error', (err: any) => {
                // If we stopped early due to size limits, treat as success.
                if (exceeded) return resolve();
                reject(err);
            });
            listing.on('end', () => resolve());
            listing.on('finish', () => resolve());
            listing.on('close', () => resolve());

            Readable.from(tarBuf).pipe(listing);
        });

        if (texFiles.length === 0) {
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        'No .tex files found in arXiv source bundle (or extraction was blocked by size limits).',
                },
                { status: 404 },
            );
        }

        const main = pickMainTex(texFiles);
        if (!main) {
            return NextResponse.json(
                { ok: false, error: 'Could not determine main TeX file.' },
                { status: 500 },
            );
        }

        return NextResponse.json({
            ok: true,
            arxivId: parsed.canonical,
            mainFile: main.path,
            mainTex: main.content,
            files: texFiles.map((f) => f.path).sort(),
            warnings,
        });
    } catch (e: any) {
        const msg = String(e?.message || e || 'Unexpected error');
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
