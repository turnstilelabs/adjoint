'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

type KatexRendererProps = {
  content: string;
  className?: string;
  autoWrap?: boolean; // when false, only explicit $...$ / $$...$$ / \(...\) / \[...\] are rendered as math
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

/**
 * Heuristic auto-wrapping of inline math when providers omit $...$ for math-y tokens.
 * - If content already contains $, leave as-is.
 * - Converts bare 'sum_{...}' -> '\\sum_{...}'.
 * - Wraps tokens containing math operators or TeX-like patterns with $...$.
 *   (operators: =, <, >, <=, >=, ^, _, \ge, \le, \frac, \sum, \int, etc.)
 */
function autoWrapInlineMathIfNeeded(input: string): string {
  if (input.includes('$')) return input;

  let s = input;

  // Unicode/operator normalization (common LLM outputs)
  s = s
    .replace(/≥/g, '\\ge ')
    .replace(/≤/g, '\\le ')
    .replace(/∑/g, '\\sum ')
    .replace(/[–−]/g, '-') // en/em minus to ASCII hyphen
    .replace(/!=/g, '\\neq ')
    .replace(/->/g, '\\to ');

  // Common TeX symbol fixes for bare words
  s = s.replace(/\bsum_/g, '\\sum_');

  // Subscript text semantics in common notations
  s = s.replace(/_\{(cyc|sym|all)\}/gi, (_m, g1) => `_{\\mathrm{${g1}}}`);

  // Normalize ASCII comparisons to TeX words
  s = s.replace(/>=/g, '\\ge ').replace(/<=/g, '\\le ');

  // Split by whitespace (preserve spaces) and group consecutive math-like tokens into a single $...$ run.
  const parts = s.split(/(\s+)/);

  const isWhitespace = (t: string) => /^\s+$/.test(t);
  // A token is math-like if it contains operators, parens/brackets/braces, backslash commands,
  // digits mixed with letters, or common punctuation used inside formulas.
  const isMathToken = (t: string) =>
    /[=<>^_+\-*/\\(){}\[\]\|]|,|;|:/.test(t) ||
    /^\d/.test(t) ||
    /\\(ge|le|frac|sum|int|neq|to|sin|cos|tan|log|ln|sqrt)\b/.test(t) ||
    /[a-zA-Z]\d/.test(t) ||
    /\d[a-zA-Z]/.test(t);

  let out: string[] = [];
  let run: string[] = [];

  const flushRun = () => {
    if (run.length > 0) {
      const body = run.join('');
      out.push(`$${body}$`);
      run = [];
    }
  };

  for (let i = 0; i < parts.length; i++) {
    const tok = parts[i];
    if (isWhitespace(tok)) {
      // End math run at whitespace boundary
      flushRun();
      out.push(tok);
      continue;
    }
    if (isMathToken(tok)) {
      run.push(tok);
    } else {
      // Non-math token: end any run and emit token as-is
      flushRun();
      out.push(tok);
    }
  }
  flushRun();

  return out.join('');
}

export function KatexRenderer({ content, className, autoWrap = true }: KatexRendererProps) {
  const parts = useMemo(() => {
    // Optionally auto-wrap missing inline math when no delimiters are present (useful for statements/proofs).
    const hinted = autoWrap ? autoWrapInlineMathIfNeeded(content) : content;
    // Normalize alternate math delimiter forms first so KaTeX parsing is robust across providers.
    const normalized = normalizeMathDelimiters(hinted);
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
