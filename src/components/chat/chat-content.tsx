'use client';

import React, { useMemo } from 'react';
import { KatexRenderer } from '@/components/katex-renderer';
import { cn } from '@/lib/utils';

type Block =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[] }
    | { type: 'para'; text: string };

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
                            <KatexRenderer content={b.text} inline autoWrap={autoWrapMath ?? true} macros={macros} />
                        </Tag>
                    );
                }

                if (b.type === 'ul') {
                    return (
                        <ul key={idx} className="list-disc pl-5 space-y-1">
                            {b.items.map((it, j) => (
                                <li key={j} className="min-w-0">
                                    <KatexRenderer content={it} inline autoWrap={autoWrapMath ?? true} macros={macros} />
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
                                    <KatexRenderer content={it} inline autoWrap={autoWrapMath ?? true} macros={macros} />
                                </li>
                            ))}
                        </ol>
                    );
                }

                // paragraph
                return (
                    <p key={idx} className="leading-relaxed">
                        <KatexRenderer content={b.text} inline autoWrap={autoWrapMath ?? true} macros={macros} />
                    </p>
                );
            })}
        </div>
    );
}
