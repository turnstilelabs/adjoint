'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

type KatexRendererProps = {
  content: string;
  className?: string;
};

/**
 * Sanitize plain text segments:
 * - Unescape "\$" to a literal "$" so users can show dollar signs outside math.
 */
const sanitizeText = (t: string) => t.replace(/\\\$/g, '$');

// Normalize common math delimiters to $...$ and $$...$$ so KaTeX can parse consistently.
// - Convert \(...\) -> $...$
// - Convert \[...\] -> $$...$$
// - Convert ```math ...``` / ```latex ...``` fenced blocks -> $$...$$
const normalizeMathDelimiters = (input: string) => {
  let s = input;

  // Fenced code blocks for math/latex
  // Accepts optional spaces after the language tag and requires a newline before the block body.
  s = s.replace(/```(?:math|latex)[\t ]*\r?\n([\s\S]*?)```/g, (_m, g1) => `$$${g1}$$`);

  // \[ ... \] -> $$ ... $$
  s = s.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, g1) => `$$${g1}$$`);

  // \( ... \) -> $ ... $
  s = s.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, g1) => `$${g1}$`);

  return s;
};

// Helper function to create a React element from a text part, converting newlines to <br>
const renderTextWithLineBreaks = (text: string, key: number) => {
  const safe = sanitizeText(text);
  const lines = safe.split('\n');
  return (
    <React.Fragment key={key}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
};

export function KatexRenderer({ content, className }: KatexRendererProps) {
  const parts = useMemo(() => {
    // Normalize alternate math delimiter forms first so KaTeX parsing is robust across providers.
    const normalized = normalizeMathDelimiters(content);
    // This regex splits the string by single or double dollar sign delimiters, keeping the delimiters.
    const splitByDelimiters = normalized.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/);

    return splitByDelimiters.map((part, index) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        const latex = part.substring(2, part.length - 2);
        try {
          const html = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: true,
            errorColor: '#dc2626',
          });
          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (error) {
          console.error('KaTeX rendering error:', error);
          return renderTextWithLineBreaks(part, index);
        }
      } else if (part.startsWith('$') && part.endsWith('$')) {
        const latex = part.substring(1, part.length - 1);
        try {
          const html = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: false,
            errorColor: '#dc2626',
          });
          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (error) {
          console.error('KaTeX rendering error:', error);
          return renderTextWithLineBreaks(part, index);
        }
      } else {
        // Render plain text parts, handling newlines
        return renderTextWithLineBreaks(part, index);
      }
    });
  }, [content]);

  // Use 'whitespace-pre-wrap' is no longer needed as we manually handle line breaks.
  return <div className={cn(className)}>{parts}</div>;
}
