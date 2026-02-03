'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { KatexRenderer } from '@/components/katex-renderer';
import { cn } from '@/lib/utils';

/**
 * ChatGPT-like Markdown renderer, but math-first:
 * - We render Markdown structure (lists, emphasis, tables, links).
 * - We run KaTeX auto-wrap ONLY on plain text nodes.
 * - We never run KaTeX inside code/inline-code or links.
 */

function renderWithKatex(
    node: React.ReactNode,
    opts: { autoWrapMath?: boolean; macros?: Record<string, string> } = {},
): React.ReactNode {
    if (node == null) return null;
    if (typeof node === 'string') {
        // IMPORTANT: keep KaTeX rendering only on leaf text.
        // This preserves Markdown structure and avoids corrupting code/links.
        return (
            <KatexRenderer
                content={node}
                inline
                autoWrap={opts.autoWrapMath ?? true}
                macros={opts.macros}
            />
        );
    }
    if (Array.isArray(node)) return node.map((n, i) => <React.Fragment key={i}>{renderWithKatex(n, opts)}</React.Fragment>);
    // React element: recurse on its children.
    if (React.isValidElement(node)) {
        const children = (node.props as any)?.children;
        if (children == null) return node;
        return React.cloneElement(node as any, {
            ...(node.props as any),
            children: renderWithKatex(children, opts),
        });
    }
    return node;
}

function stripTrailingNewline(s: string) {
    return String(s ?? '').replace(/\n$/, '');
}

export function ChatMarkdownContent({
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
    // Avoid re-creating plugins array every render.
    const remarkPlugins = useMemo(() => [remarkGfm], []);

    return (
        <div className={cn('space-y-3', className)}>
            <ReactMarkdown
                remarkPlugins={remarkPlugins as any}
                components={{
                    p: ({ children }) => (
                        <div className="whitespace-pre-wrap leading-relaxed">
                            {renderWithKatex(children, { autoWrapMath, macros })}
                        </div>
                    ),
                    h1: ({ children }) => (
                        <h3 className="text-base font-semibold leading-snug">
                            {renderWithKatex(children, { autoWrapMath, macros })}
                        </h3>
                    ),
                    h2: ({ children }) => (
                        <h4 className="text-sm font-semibold leading-snug">
                            {renderWithKatex(children, { autoWrapMath, macros })}
                        </h4>
                    ),
                    h3: ({ children }) => (
                        <h5 className="text-sm font-medium leading-snug">
                            {renderWithKatex(children, { autoWrapMath, macros })}
                        </h5>
                    ),
                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
                    li: ({ children }) => (
                        <li className="min-w-0">{renderWithKatex(children, { autoWrapMath, macros })}</li>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="rounded-md border-l-2 border-border/60 bg-muted/20 px-3 py-2 text-foreground/85">
                            <div className="space-y-2">{renderWithKatex(children, { autoWrapMath, macros })}</div>
                        </blockquote>
                    ),
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4 text-primary hover:text-primary/80 break-words"
                        >
                            {/* Never run KaTeX inside links (URLs / anchors should remain literal). */}
                            {children}
                        </a>
                    ),
                    code: (props: any) => {
                        const { className, children } = props || {};
                        const inline = Boolean((props as any)?.inline);
                        const txt = stripTrailingNewline(String(children ?? ''));
                        if (inline) {
                            return (
                                <code className="mx-0.5 rounded bg-muted/50 px-1.5 py-0.5 font-code text-[0.85em] text-foreground/90">
                                    {txt}
                                </code>
                            );
                        }
                        // Fenced blocks are rendered by `pre` below; keep this safe fallback.
                        return (
                            <code className={cn('font-code text-foreground/90', className)}>{txt}</code>
                        );
                    },
                    pre: ({ children }) => (
                        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
                            {children}
                        </pre>
                    ),
                    table: ({ children }) => (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-xs">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-muted/40">{children}</thead>,
                    th: ({ children }) => (
                        <th className="px-3 py-2 text-left font-medium">{renderWithKatex(children, { autoWrapMath, macros })}</th>
                    ),
                    td: ({ children }) => (
                        <td className="px-3 py-2 align-top">{renderWithKatex(children, { autoWrapMath, macros })}</td>
                    ),
                    hr: () => <div className="h-px w-full bg-border/60 my-3" />,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
