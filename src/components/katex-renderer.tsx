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
  if (typeof input !== 'string') return '';
  if (input.includes('$')) return input;

  let s = String(input);

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
  // Promote plain 'sum' to '\sum' when it is followed by variables/indices or a parenthesized term
  s = s.replace(/\bsum\b(?=\s*(?:\(|[A-Za-z](?:_[A-Za-z0-9]+)?))/g, '\\sum');

  // Normalize cyclic/symmetric subscripts for sum whether or not the backslash is present:
  // Handles: "\sum_{cyc}", "sum_{cyc}", "\sum_cyc", "sum_cyc" (and sym/all)
  s = s.replace(/\\?sum_(?:\{(cyc|sym|all)\}|(cyc|sym|all))/gi, (_m, g1, g2) => {
    const tag = (g1 || g2).toLowerCase();
    return `\\sum_{\\mathrm{${tag}}}`;
  });

  // Subscript text semantics in common notations
  s = s.replace(/_\{(cyc|sym|all)\}/gi, (_m, g1) => `_{\\mathrm{${g1}}}`);

  // Normalize ASCII comparisons to TeX words
  s = s.replace(/>=/g, '\\ge ').replace(/<=/g, '\\le ');

  // Ensure standalone \sum(...) with (optional) subscript is wrapped even if grouping misses it.
  // e.g., "\sum_{cyc}(bc)^2/(a(b+c))" -> "$\sum_{\\mathrm{cyc}}(bc)^2/(a(b+c))$"
  // (Safe here because we only run autoWrap when no '$' exists in the input.)
  s = s.replace(
    /(\\sum(?:_\{[^}]+\}|_[A-Za-z]+)?\([^)]*\))/g,
    (_m, g1) => `$${g1}$`
  );

  // If this looks like a full math expression, wrap the whole line once to avoid fragmenting
  // Heuristics: presence of \sum, \frac, subscripts like x_i, comparison ops, ^ exponents, or '='
  if (/(\\sum|\\frac|[A-Za-z]_[A-Za-z0-9]|\\ge|\\le|\\neq|\^|=)/.test(s)) {
    return `$${s}$`;
  }

  // Split by whitespace (preserve spaces) and group consecutive math-like tokens into a single $...$ run.
  const parts = s.split(/(\s+)/);

  const isWhitespace = (t: string) => /^\s+$/.test(t);
  // A token is math-like if it contains operators, parens/brackets/braces, backslash commands,
  // digits mixed with letters, or common punctuation used inside formulas.
  // Avoid false positives for pure words or hyphenated words like "left-hand".
  const isMathToken = (t: string) => {
    // Pure word or hyphenated word (letters only) -> not math
    if (/^[A-Za-z]+(?:-[A-Za-z]+)*$/.test(t)) return false;

    // Any TeX command e.g. \sum, \frac, \sin, \cdots, \langle ...
    if (/\\[A-Za-z]+/.test(t)) return true;

    // Operators, delimiters, or bars
    if (/[=<>^_+\-*/(){}\[\]\|]/.test(t)) return true;

    // Punctuation that commonly appears in formulas
    if (/[,;:]/.test(t)) return true;

    // Digits mixed with letters, or standalone numbers
    if ((/\d/.test(t) && /[A-Za-z]/.test(t)) || /^\d+(\.\d+)?$/.test(t)) return true;

    return false;
  };

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

    // Sanitize: remove $...$ around plain words (e.g., $Substitution$ -> Substitution)
    const sanitized = normalized.replace(/\$([A-Za-z][A-Za-z\s\-']{0,30})\$/g, '$1');

    // This regex splits the string by single or double dollar sign delimiters, keeping the delimiters.
    const splitByDelimiters = sanitized.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/);

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
