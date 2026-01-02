import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const p = path.join(process.cwd(), 'src', 'lib', 'math-trivia.json');
        const raw = await readFile(p, 'utf8');
        // Validate that the JSON parses; return parsed array.
        const data = JSON.parse(raw);

        return NextResponse.json(data, {
            headers: {
                // Ensure latest local changes show up immediately in dev.
                'Cache-Control': 'no-store',
            },
        });
    } catch (e: any) {
        return NextResponse.json(
            {
                error: 'Failed to load trivia dataset.',
                detail: e instanceof Error ? e.message : String(e),
            },
            { status: 500 },
        );
    }
}

