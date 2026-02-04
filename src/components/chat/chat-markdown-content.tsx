'use client';

import React, { useMemo } from 'react';

import { KatexRenderer } from '@/components/katex-renderer';
import { cn } from '@/lib/utils';

type Segment =
    | { type: 'text'; content: string }
    | { type: 'code'; language: string | null; code: string };

function splitFencedCodeBlocks(input: string): Segment[] {
    const s = String(input ?? '').replace(/\r\n/g, '\n');
    const out: Segment[] = [];

    // Match fenced blocks: ```lang\n ... \n```
    // Non-greedy body so multiple blocks work.
    const re = /```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/g;

    let last = 0;
    for (const m of s.matchAll(re)) {
        const idx = m.index ?? 0;
        const full = m[0] ?? '';
        const lang = (m[1] ?? '').trim() || null;
        const body = String(m[2] ?? '').replace(/\n$/, '');

        if (idx > last) out.push({ type: 'text', content: s.slice(last, idx) });
        out.push({ type: 'code', language: lang, code: body });
        last = idx + full.length;
    }

    if (last < s.length) out.push({ type: 'text', content: s.slice(last) });
    return out;
}

/**
 * Chat renderer aligned with the proof streaming statement card:
 * - For normal text, we pass the entire string through `KatexRenderer` (block mode)
 *   so display math ($$...$$) and inline math ($...$) behave consistently.
 * - We keep ONLY fenced code blocks as code blocks.
 *
 * This deliberately avoids AST recursion + per-text-node KaTeX heuristics, which were
 * causing fragmented display-math and broken spacing in longer messages.
 */
export function ChatMarkdownContent({
    content,
    className,
    macros,
}: {
    content: string;
    className?: string;
    // NOTE: kept for API compatibility; we intentionally don't do heuristic auto-wrapping here.
    autoWrapMath?: boolean;
    macros?: Record<string, string>;
}) {
    const segments = useMemo(() => splitFencedCodeBlocks(content), [content]);

    return (
        <div className={cn('space-y-3', className)}>
            {segments.map((seg, i) => {
                if (seg.type === 'code') {
                    return (
                        <div key={`code-${i}`} className="relative">
                            {seg.language && (
                                <div className="absolute right-2 top-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {seg.language}
                                </div>
                            )}
                            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
                                <code className="font-code text-foreground/90">{seg.code}</code>
                            </pre>
                        </div>
                    );
                }

                const txt = String(seg.content ?? '').trimEnd();
                if (!txt) return null;

                return (
                    <div key={`text-${i}`} className="whitespace-pre-wrap leading-relaxed">
                        {/* Match proof statement rendering: feed full block to KatexRenderer */}
                        <KatexRenderer content={txt} macros={macros} />
                    </div>
                );
            })}
        </div>
    );
}
