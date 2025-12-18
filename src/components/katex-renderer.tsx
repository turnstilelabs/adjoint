'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

type KatexRendererProps = {
  content: string;
  className?: string;
  autoWrap?: boolean; // when false, only explicit $...$ / $$...$$ / \(...\) / \[...\] are rendered as math
  inline?: boolean; // when true, render container as <span> to avoid block breaks inside lists
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
  const text = String(input);

  // Normalize and wrap math-like tokens only in plain (non-$...$) segments.
  const normalizePlain = (seg: string) => {
    let s = seg;
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
    return s;
  };

  const wrapPlain = (seg: string) => {
    const s = normalizePlain(seg);

    // Split by whitespace (preserve spaces) and group consecutive math-like tokens into a single $...$ run.
    const parts = s.split(/(\s+)/);

    const isWhitespace = (t: string) => /^\s+$/.test(t);
    // A token is math-like if it contains operators, parens/brackets/braces, backslash commands,
    // digits mixed with letters, or common punctuation used inside formulas.
    // Avoid false positives for pure words or hyphenated words like "left-hand".
    const isMathToken = (t: string) => {
      // Allow bracket-wrapped hyphenated words with optional trailing punctuation to remain plain text
      // Examples that should stay plain: "word,", "word:", "(AM-GM)", "[well-known];"
      const core = t
        // remove one leading/trailing bracket if present
        .replace(/^[({\[]/, '')
        .replace(/[)}\]]$/, '')
        // strip leading/trailing commas/colons/semicolons
        .replace(/^[,;:]+|[,;:]+$/g, '');

      // Pure word or hyphenated word (letters only) -> not math
      if (/^[A-Za-z]+(?:-[A-Za-z]+)*$/.test(core)) return false;

      // Any TeX command e.g. \sum, \frac, \sin, ...
      if (/\\[A-Za-z]+/.test(t)) return true;

      // Strong math operators (exclude brackets so they don't trigger by themselves)
      // Note: hyphen remains to allow "x-1" etc. to be detected as math, but the "core" guard above
      // prevents false positives like "(AM-GM)" or "well-known"
      if (/[=<>^_+\-*/|]/.test(t)) return true;

      // Digits mixed with letters, or standalone numbers
      if ((/\d/.test(t) && /[A-Za-z]/.test(t)) || /^\d+(\.\d+)?$/.test(t)) return true;

      return false;
    };

    let out: string[] = [];
    let run: string[] = [];

    const flushRun = () => {
      if (run.length > 0) {
        out.push(`$${run.join('')}$`);
        run = [];
      }
    };

    for (let i = 0; i < parts.length; i++) {
      const tok = parts[i];
      if (isWhitespace(tok)) {
        // Preserve whitespace inside an ongoing math run so expressions like
        // "\{X(t)\}_{t\ge 0}" are not split into two invalid fragments.
        if (run.length > 0) {
          run.push(tok);
        } else {
          out.push(tok);
        }
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
  };

  // Split preserving math segments; only transform plain segments.
  const segments = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/);
  let result = segments
    .map((seg) => {
      if (seg.startsWith('$$') || seg.startsWith('$')) {
        return seg; // leave math intact
      }
      return wrapPlain(seg);
    })
    .join('');

  // Note: Removed global whole-line auto-wrap to avoid wrapping long prose into math.
  // We rely on token-level wrapping above so prose + math can coexist safely.

  return result;
}

export function KatexRenderer({ content, className, autoWrap = true, inline = false }: KatexRendererProps) {
  const parts = useMemo(() => {
    // Normalize alternate math delimiter forms first so KaTeX parsing is robust across providers.
    const normalized = normalizeMathDelimiters(content);

    // After normalizing, auto-wrap only outside existing $...$/$$...$$ segments (autoWrap helper preserves them).
    const hinted = autoWrap ? autoWrapInlineMathIfNeeded(normalized) : normalized;

    // This regex splits the string by single or double dollar sign delimiters, keeping the delimiters.
    const splitByDelimiters = hinted.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/);

    return splitByDelimiters.map((part, index) => {
      // Check if the part is a text-only math expression (e.g. $word$ or $some text$)
      const textOnlyMatch = part.match(/^\$([A-Za-z][A-Za-z\s\-']{0,30})\$$/);
      if (textOnlyMatch) {
        return renderTextWithLineBreaks(textOnlyMatch[1], index);
      }

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
  return inline ? (
    <span className={cn(className)}>{parts}</span>
  ) : (
    <div className={cn(className)}>{parts}</div>
  );
}
