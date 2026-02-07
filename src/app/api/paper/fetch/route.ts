import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = new Set(['export.arxiv.org', 'arxiv.org']);

function isAllowedUrl(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) return false;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    return true;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('url');
    if (!raw) {
        return NextResponse.json({ ok: false, error: 'Missing url.' }, { status: 400 });
    }

    let target: URL;
    try {
        target = new URL(raw);
    } catch {
        return NextResponse.json({ ok: false, error: 'Invalid url.' }, { status: 400 });
    }

    if (!isAllowedUrl(target)) {
        return NextResponse.json({ ok: false, error: 'Unsupported url host.' }, { status: 403 });
    }

    try {
        const upstream = await fetch(target.toString(), {
            redirect: 'follow',
            headers: {
                Accept: 'application/pdf',
                'User-Agent': 'Mozilla/5.0 (compatible; Adjoint/1.0)',
            },
        });

        if (!upstream.ok) {
            return NextResponse.json(
                { ok: false, error: `Upstream fetch failed (${upstream.status}).` },
                { status: 502 },
            );
        }

        const contentType = upstream.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('pdf') && !contentType.toLowerCase().includes('octet-stream')) {
            return NextResponse.json(
                { ok: false, error: `Upstream did not return a PDF (${contentType || 'unknown'}).` },
                { status: 502 },
            );
        }

        const buf = await upstream.arrayBuffer();
        const headers = new Headers();
        headers.set('Content-Type', upstream.headers.get('content-type') || 'application/pdf');
        headers.set('Cache-Control', 'public, max-age=3600');

        return new NextResponse(buf, { status: 200, headers });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: String(e?.message || e || 'Fetch failed.') },
            { status: 502 },
        );
    }
}
