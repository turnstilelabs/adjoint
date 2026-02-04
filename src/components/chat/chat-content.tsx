'use client';

import React, { useMemo } from 'react';
import { KatexRenderer } from '@/components/katex-renderer';
import { cn } from '@/lib/utils';

type Block =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'quote'; text: string }
    | { type: 'code'; language: string | null; code: string }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[] }
    | { type: 'para'; text: string };

type InlineSeg =
    | { type: 'text'; text: string }
    | { type: 'code'; text: string };

function splitInlineCode(input: string): InlineSeg[] {
    const s = String(input ?? '');
    const out: InlineSeg[] = [];

    // Simple backtick parsing (no nesting). Good enough for chat.
    // If there is an unmatched backtick, we treat it as plain text.
    let i = 0;
    while (i < s.length) {
        const start = s.indexOf('`', i);
        if (start < 0) {
            out.push({ type: 'text', text: s.slice(i) });
            break;
        }
        const end = s.indexOf('`', start + 1);
        if (end < 0) {
            out.push({ type: 'text', text: s.slice(i) });
            break;
        }
        if (start > i) out.push({ type: 'text', text: s.slice(i, start) });
        out.push({ type: 'code', text: s.slice(start + 1, end) });
        i = end + 1;
    }
    return out;
}

function InlineText({
    text,
    autoWrapMath,
    macros,
}: {
    text: string;
    autoWrapMath?: boolean;
    macros?: Record<string, string>;
}) {
    const segs = useMemo(() => splitInlineCode(text), [text]);

    return (
        <>
            {segs.map((seg, idx) => {
                if (seg.type === 'code') {
                    return (
                        <code
                            key={idx}
                            className="mx-0.5 rounded bg-muted/50 px-1.5 py-0.5 font-code text-[0.85em] text-foreground/90"
                        >
                            {seg.text}
                        </code>
                    );
                }

                return (
                    <KatexRenderer
                        key={idx}
                        content={seg.text}
                        inline
                        autoWrap={autoWrapMath ?? true}
                        macros={macros}
                    />
                );
            })}
        </>
    );
}

function parseBlocks(input: string): Block[] {
    const s = String(input ?? '').replace(/\r\n/g, '\n');
    const lines = s.split('\n');
    const blocks: Block[] = [];

    let i = 0;
    const isBlank = (l: string | undefined) => !l || l.trim().length === 0;

    while (i < lines.length) {
        const line = lines[i] ?? '';

        // Skip blank lines (paragraph delimiters)
        if (isBlank(line)) {
            i++;
            continue;
        }

        // Headings (#, ##, ###)
        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
            const level = Math.min(3, Math.max(1, h[1].length)) as 1 | 2 | 3;
            blocks.push({ type: 'heading', level, text: (h[2] ?? '').trim() });
            i++;
            continue;
        }

        // Fenced code block ```lang
        const fence = line.match(/^\s*```\s*([a-zA-Z0-9_+-]+)?\s*$/);
        if (fence) {
            const language = (fence[1] ?? '').trim() || null;
            i++;
            const buf: string[] = [];
            while (i < lines.length) {
                const l = lines[i] ?? '';
                if (/^\s*```\s*$/.test(l)) {
                    i++;
                    break;
                }
                buf.push(l);
                i++;
            }
            blocks.push({ type: 'code', language, code: buf.join('\n').replace(/\s+$/, '') });
            continue;
        }

        // Blockquote (> ...)
        const q = line.match(/^\s*>\s?(.*)$/);
        if (q) {
            const buf: string[] = [];
            while (i < lines.length) {
                const l = lines[i] ?? '';
                const m = l.match(/^\s*>\s?(.*)$/);
                if (!m) break;
                buf.push(String(m[1] ?? ''));
                i++;
            }
            blocks.push({ type: 'quote', text: buf.join('\n').trimEnd() });
            continue;
        }

        // Unordered list block
        const ul = line.match(/^\s*[-*]\s+(.*)$/);
        if (ul) {
            const items: string[] = [];
            while (i < lines.length) {
                const l = lines[i] ?? '';
                const m = l.match(/^\s*[-*]\s+(.*)$/);
                if (!m) break;
                items.push(String(m[1] ?? '').trim());
                i++;
            }
            blocks.push({ type: 'ul', items });
            continue;
        }

        // Ordered list block
        const ol = line.match(/^\s*\d+\.\s+(.*)$/);
        if (ol) {
            const items: string[] = [];
            while (i < lines.length) {
                const l = lines[i] ?? '';
                const m = l.match(/^\s*\d+\.\s+(.*)$/);
                if (!m) break;
                items.push(String(m[1] ?? '').trim());
                i++;
            }
            blocks.push({ type: 'ol', items });
            continue;
        }

        // Paragraph: consume until blank line or a new block starts
        const buf: string[] = [];
        while (i < lines.length) {
            const l = lines[i] ?? '';
            if (isBlank(l)) break;
            if (/^(#{1,3})\s+/.test(l)) break;
            if (/^\s*```/.test(l)) break;
            if (/^\s*>\s?/.test(l)) break;
            if (/^\s*[-*]\s+/.test(l)) break;
            if (/^\s*\d+\.\s+/.test(l)) break;
            buf.push(l);
            i++;
        }
        blocks.push({ type: 'para', text: buf.join('\n').trimEnd() });
    }

    return blocks;
}

export function ChatContent({
    content,
    className,
    autoWrapMath,
    macros,
}: {
    content: string;
    className?: string;
    autoWrapMath?: boolean;
    macros?: Record<string, string>;
}) {
    const blocks = useMemo(() => parseBlocks(content), [content]);

    return (
        <div className={cn('space-y-3', className)}>
            {blocks.map((b, idx) => {
                if (b.type === 'heading') {
                    const Tag = (b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5') as any;
                    const cls =
                        b.level === 1
                            ? 'text-base font-semibold'
                            : b.level === 2
                                ? 'text-sm font-semibold'
                                : 'text-sm font-medium';
                    return (
                        <Tag key={idx} className={cn(cls, 'leading-snug')}>
                            <InlineText text={b.text} autoWrapMath={autoWrapMath} macros={macros} />
                        </Tag>
                    );
                }

                if (b.type === 'quote') {
                    return (
                        <blockquote
                            key={idx}
                            className="rounded-md border-l-2 border-border/60 bg-muted/20 px-3 py-2 text-foreground/85"
                        >
                            <div className="whitespace-pre-wrap leading-relaxed">
                                <InlineText text={b.text} autoWrapMath={autoWrapMath} macros={macros} />
                            </div>
                        </blockquote>
                    );
                }

                if (b.type === 'code') {
                    return (
                        <div key={idx} className="relative">
                            {b.language && (
                                <div className="absolute right-2 top-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {b.language}
                                </div>
                            )}
                            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
                                <code className="font-code text-foreground/90">{b.code}</code>
                            </pre>
                        </div>
                    );
                }

                if (b.type === 'ul') {
                    return (
                        <ul key={idx} className="list-disc pl-5 space-y-1">
                            {b.items.map((it, j) => (
                                <li key={j} className="min-w-0">
                                    <InlineText text={it} autoWrapMath={autoWrapMath} macros={macros} />
                                </li>
                            ))}
                        </ul>
                    );
                }

                if (b.type === 'ol') {
                    return (
                        <ol key={idx} className="list-decimal pl-5 space-y-1">
                            {b.items.map((it, j) => (
                                <li key={j} className="min-w-0">
                                    <InlineText text={it} autoWrapMath={autoWrapMath} macros={macros} />
                                </li>
                            ))}
                        </ol>
                    );
                }

                // paragraph
                return (
                    <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                        <InlineText text={b.text} autoWrapMath={autoWrapMath} macros={macros} />
                    </div>
                );
            })}
        </div>
    );
}
