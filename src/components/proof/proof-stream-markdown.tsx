'use client';

import React, { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { ChatMarkdownContent } from '@/components/chat/chat-markdown-content';
import { formatProofStreamText } from '@/lib/proof-stream-format';

/**
 * Proof streaming renderer:
 * - Pre-normalizes common LaTeX structure (\section, claim env) into markdown-ish text
 * - Then reuses the chat math-first renderer so headings/quotes/code blocks show reasonably.
 */
export function ProofStreamMarkdown({
    content,
    className,
    macros,
}: {
    content: string;
    className?: string;
    macros?: Record<string, string>;
}) {
    const normalized = useMemo(() => formatProofStreamText(content), [content]);
    return <ChatMarkdownContent content={normalized} className={cn('text-sm', className)} macros={macros} />;
}
