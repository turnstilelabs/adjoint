'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

type KatexRendererProps = {
  content: string;
  className?: string;
  autoWrap?: boolean; // when false, only explicit $...$ / $$...$$ / \(...\) / \[...\] are rendered as math
  inline?: boolean; // when true, render container as <span> to avoid block breaks inside lists
  output?: 'html' | 'htmlAndMathml';
  /**
   * KaTeX macro map (\name -> replacement). This is intentionally *not* inferred
   * automatically at this layer to avoid changing behavior globally.
   */
  macros?: Record<string, string>;
  /**
   * When true (default), if KaTeX produces an error node we fall back to rendering
   * the math segment as plain text (useful for Explore artifacts where partial/invalid
   * math would otherwise show large red error fragments).
   *
   * When false, we keep KaTeX's output even if it contains error nodes. This is
   * important for streaming UIs where the text is temporarily invalid while tokens
   * are arriving ("live draft" rendering).
   */
  fallbackOnError?: boolean;
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
const normalizeMathDelimiters = (input: unknown) => {
  // Defensive: some call sites may pass null/undefined (e.g. while loading / resuming views).
  // KaTeX rendering should never crash the app.
  let s = typeof input === 'string' ? input : String(input ?? '');

  // Fenced code blocks for math/latex
  // Accepts optional spaces after the language tag and requires a newline before the block body.
  s = s.replace(/```(?:math|latex)[\t ]*\r?\n([\s\S]*?)```/g, (_m, g1) => `$$${g1}$$`);

  // \[ ... \] -> $$ ... $$
  s = s.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, g1) => `$$${g1}$$`);

  // \( ... \) -> $ ... $
  s = s.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, g1) => `$${g1}$`);

  // AMS align environment -> aligned inside display math.
  // KaTeX supports `aligned` (inside math mode), but not full LaTeX `align`.
  // Non-greedy inner match so multiple environments can coexist.
  s = s.replace(
    /\\begin\{align\*?\}\s*([\s\S]*?)\s*\\end\{align\*?\}/g,
    (_m, inner) => `$$\\begin{aligned}${String(inner ?? '')}\\end{aligned}$$`,
  );

  return s;
};

// Helper function to create a React element from a text part, converting newlines to <br>
function renderInlineEmphasis(text: string, keyPrefix: string): React.ReactNode[] {
  // Minimal emphasis support (render-side only):
  //   **bold** -> <strong>
  //   *italic* -> <em>
  // Does NOT implement full Markdown; intended to handle common LLM output.
  // Supports escaping with backslash: \* renders a literal '*'.

  const nodes: React.ReactNode[] = [];
  let buf = '';
  let i = 0;
  let key = 0;

  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = '';
    }
  };

  const readUntil = (delim: '*' | '**', start: number) => {
    for (let j = start; j < text.length; j++) {
      if (text[j] === '\\') {
        j++; // skip escaped char
        continue;
      }
      if (delim === '**') {
        if (text[j] === '*' && text[j + 1] === '*') return j;
      } else {
        if (text[j] === '*') return j;
      }
    }
    return -1;
  };

  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    if (text[i] === '*' && text[i + 1] === '*') {
      const end = readUntil('**', i + 2);
      if (end !== -1) {
        flush();
        const inner = text.slice(i + 2, end);
        nodes.push(
          <strong key={`${keyPrefix}-b-${key++}`}>{renderInlineEmphasis(inner, `${keyPrefix}-b-${key}`)}</strong>,
        );
        i = end + 2;
        continue;
      }
      // No closing '**' found -> treat literally
      buf += '**';
      i += 2;
      continue;
    }

    if (text[i] === '*') {
      const end = readUntil('*', i + 1);
      if (end !== -1) {
        flush();
        const inner = text.slice(i + 1, end);
        nodes.push(
          <em key={`${keyPrefix}-i-${key++}`}>{renderInlineEmphasis(inner, `${keyPrefix}-i-${key}`)}</em>,
        );
        i = end + 1;
        continue;
      }
      // No closing '*' found -> treat literally
      buf += '*';
      i += 1;
      continue;
    }

    buf += text[i];
    i += 1;
  }

  flush();
  return nodes;
}

const renderTextWithLineBreaks = (text: string, key: number) => {
  const safe = sanitizeText(text);
  const lines = safe.split('\n');
  return (
    <React.Fragment key={key}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {renderInlineEmphasis(line, `${key}-${i}`)}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
};

/**
 * Heuristic auto-wrapping of inline math when providers omit $...$ for math-y tokens.
 * - If content already contains $, leave as-is.
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

    // NOTE: we intentionally do NOT rewrite plain English words like "sum"/"sum_" into TeX.
    // Only explicit TeX ("\\sum") or unicode "∑" should render as a summation symbol.

    // Subscript text semantics in common notations (independent of "sum")
    s = s.replace(/_\{(cyc|sym|all)\}/gi, (_m, g1) => `_{\\mathrm{${g1}}}`);

    // Normalize ASCII comparisons to TeX words
    s = s.replace(/>=/g, '\\ge ').replace(/<=/g, '\\le ');
    return s;
  };

  const wrapPlain = (seg: string) => {
    // If a provider emits spaced emphasis markers like "* *word* *" (common in streaming),
    // normalize them so we don’t end up with isolated "*" tokens.
    // We still do NOT render Markdown, but this reduces weird interactions with the math heuristic.
    const s = normalizePlain(seg).replace(/\*\s+\*/g, '**');

    // Split by whitespace (preserve spaces) and group consecutive math-like tokens into a single $...$ run.
    const parts = s.split(/(\s+)/);

    const isWhitespace = (t: string) => /^\s+$/.test(t);
    // A token is math-like if it contains operators, parens/brackets/braces, backslash commands,
    // digits mixed with letters, or common punctuation used inside formulas.
    // Avoid false positives for pure words or hyphenated words like "left-hand".
    const isMathToken = (t: string) => {
      // Markdown emphasis markers should never trigger math rendering.
      // - "*", "**" etc. are not math
      // - "*word*" should be treated like "word" for classification
      // NOTE: we intentionally keep interior '*' (e.g. "a*b") as math.
      if (/^\*+$/.test(t)) return false;

      // If this token looks like Markdown emphasis, do NOT treat it as math.
      // Otherwise we'd create invalid segments like `$*a*b*$`.
      if (/^\*+[^*][\s\S]*\*+$/.test(t)) return false;

      const mdStripped = t.replace(/^\*+|\*+$/g, '');

      // Very specific fix: dash-prefixed English words after inline math should stay text.
      // Example: "$(1-\eps)$-approximate union" should not wrap "-approximate" into math.
      // Keep negative numbers/variables as math (e.g. -1, -x).
      if (/^-[A-Za-z]{2,}(?:-[A-Za-z]+)*$/.test(mdStripped)) return false;

      // Allow bracket-wrapped hyphenated words with optional trailing punctuation to remain plain text
      // Examples that should stay plain: "word,", "word:", "(AM-GM)", "[well-known];"
      const core = mdStripped
        // remove one leading/trailing bracket if present
        .replace(/^[({\[]/, '')
        .replace(/[)}\]]$/, '')
        // strip leading/trailing commas/colons/semicolons
        .replace(/^[,;:]+|[,;:]+$/g, '');

      // Pure word or hyphenated word (letters only) -> not math
      if (/^[A-Za-z]+(?:-[A-Za-z]+)*$/.test(core)) return false;

      // Any TeX command e.g. \sum, \frac, \sin, ...
      if (/\\[A-Za-z]+/.test(mdStripped)) return true;

      // Strong math operators (exclude brackets so they don't trigger by themselves)
      // Note: hyphen remains to allow "x-1" etc. to be detected as math, but the "core" guard above
      // prevents false positives like "(AM-GM)" or "well-known"
      if (/[=<>^_+\-*/|]/.test(mdStripped)) return true;

      // Digits mixed with letters, or standalone numbers
      if ((/\d/.test(mdStripped) && /[A-Za-z]/.test(mdStripped)) || /^\d+(\.\d+)?$/.test(mdStripped)) {
        return true;
      }

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

export function KatexRenderer({
  content,
  className,
  autoWrap = true,
  inline = false,
  output = 'htmlAndMathml',
  macros,
  fallbackOnError = true,
}: KatexRendererProps) {
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
            output,
            macros,
          });

          // If KaTeX could not parse the expression, it emits a "katex-error" span.
          // For Explore artifacts, we prefer to fall back to plain text rather than show
          // a big red error fragment.
          if (fallbackOnError && html.includes('katex-error')) {
            return renderTextWithLineBreaks(latex, index);
          }

          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (error) {
          console.error('KaTeX rendering error:', error);
          return renderTextWithLineBreaks(latex, index);
        }
      } else if (part.startsWith('$') && part.endsWith('$')) {
        const latex = part.substring(1, part.length - 1);
        try {
          const html = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: false,
            errorColor: '#dc2626',
            output,
            macros,
          });

          if (fallbackOnError && html.includes('katex-error')) {
            return renderTextWithLineBreaks(latex, index);
          }

          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (error) {
          console.error('KaTeX rendering error:', error);
          return renderTextWithLineBreaks(latex, index);
        }
      } else {
        // Render plain text parts, handling newlines
        return renderTextWithLineBreaks(part, index);
      }
    });
  }, [content, autoWrap, output, macros, fallbackOnError]);

  // Use 'whitespace-pre-wrap' is no longer needed as we manually handle line breaks.
  // Ensure math never causes global horizontal overflow.
  // Callers can still override/extend with `className`.
  const wrapperClass = cn('katex-wrap', className);

  return inline ? (
    <span className={wrapperClass}>{parts}</span>
  ) : (
    <div className={wrapperClass}>{parts}</div>
  );
}
