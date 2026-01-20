/*
 * Minimal prose renderer for proof text.
 *
 * We do not parse Markdown.
 * - Blank lines delimit paragraphs.
 * - Single newlines are preserved via KatexRenderer (it inserts <br/>).
 */

'use client';

import React from 'react';
import { KatexRenderer } from '@/components/katex-renderer';
import { cn } from '@/lib/utils';

export function splitIntoParagraphs(text: string): string[] {
    const normalized = (text ?? '').replace(/\r\n/g, '\n');
    // Split on >=1 blank line (optionally containing whitespace)
    const paras = normalized
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean);

    // If there were no non-empty paragraphs, return the original string
    // to avoid hiding content like a single whitespace-only proof.
    return paras.length ? paras : [normalized];
}

export default function AdjointProse({
    content,
    className,
    paragraphClassName,
    autoWrapMath,
    macros,
}: {
    content: string;
    className?: string;
    paragraphClassName?: string;
    /**
     * When true (default), apply the same inline auto-wrap heuristic as chat messages.
     * When false, only explicit $...$ / $$...$$ / \(\) / \[\] are treated as math.
     */
    autoWrapMath?: boolean;
    macros?: Record<string, string>;
}) {
    const paragraphs = splitIntoParagraphs(content);

    return (
        <div className={cn('adjoint-prose space-y-4', className)}>
            {paragraphs.map((para, idx) => (
                <p key={idx} className={cn('adjoint-paragraph', paragraphClassName)}>
                    <KatexRenderer content={para} inline autoWrap={autoWrapMath ?? true} macros={macros} />
                </p>
            ))}
        </div>
    );
}
