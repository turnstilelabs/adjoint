'use client';

import React, { useMemo } from 'react';

import { KatexRenderer } from '@/components/katex-renderer';
import { cn } from '@/lib/utils';

type Segment =
    | { type: 'text'; content: string }
    | { type: 'code'; language: string | null; code: string };

type TextBlock =
    | { kind: 'heading'; level: number; text: string }
    | { kind: 'text'; text: string };

function splitTextBlocks(input: string): TextBlock[] {
    const s = String(input ?? '').replace(/\r\n/g, '\n');
    const lines = s.split('\n');
    const out: TextBlock[] = [];
    let buf: string[] = [];

    const flush = () => {
        if (buf.length === 0) return;
        out.push({ kind: 'text', text: buf.join('\n') });
        buf = [];
    };

    for (const ln of lines) {
        const m = ln.match(/^(#{2,6})\s+(.*)$/);
        if (m) {
            flush();
            out.push({ kind: 'heading', level: m[1].length, text: (m[2] ?? '').trim() });
        } else {
            buf.push(ln);
        }
    }

    flush();
    return out;
}

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

                const blocks = splitTextBlocks(txt);

                return (
                    <div key={`text-${i}`} className="space-y-2">
                        {blocks.map((l, j) => {
                            if (l.kind === 'heading') {
                                const cls =
                                    l.level === 2
                                        ? 'text-base font-semibold'
                                        : l.level === 3
                                            ? 'text-sm font-semibold'
                                            : 'text-sm font-medium';
                                return (
                                    <div key={`h-${i}-${j}`} className={cn(cls, 'mt-2')}>
                                        <KatexRenderer content={l.text} macros={macros} inline />
                                    </div>
                                );
                            }
                            // Normal text block: preserve line breaks and wrap.
                            return (
                                <div
                                    key={`t-${i}-${j}`}
                                    className="whitespace-pre-wrap leading-relaxed"
                                >
                                    <KatexRenderer content={l.text} macros={macros} />
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
