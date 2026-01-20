/* eslint-disable react/no-unescaped-entities */
'use client';

import { useMemo } from 'react';
import { KatexRenderer } from '@/components/katex-renderer';
import { cn } from '@/lib/utils';
import { extractKatexMacrosFromLatexDocument } from '@/lib/latex/extract-katex-macros';

type Segment =
  | { type: 'text'; content: string }
  | { type: 'math'; content: string; displayMode: boolean };

function splitLatexIntoSegments(input: string): Segment[] {
  const s = String(input ?? '');
  const out: Segment[] = [];

  // Order matters: display delimiters before inline delimiters.
  // We keep the delimiters in the match so we can strip them.
  // Match explicit math blocks/inline math.
  // Important: we only treat \[...\] and \(...\) as math (not bare [...] or (...)).
  const pattern = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^\n\$]*?\$)/g;

  let lastIdx = 0;
  for (const m of s.matchAll(pattern)) {
    const idx = m.index ?? 0;
    const raw = m[0] ?? '';

    if (idx > lastIdx) {
      out.push({ type: 'text', content: s.slice(lastIdx, idx) });
    }

    // $$...$$
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
      out.push({ type: 'math', content: raw.slice(2, -2), displayMode: true });
    }
    // \[...\]
    else if (raw.startsWith('\\[') && raw.endsWith('\\]')) {
      out.push({ type: 'math', content: raw.slice(2, -2), displayMode: true });
    }
    // \(...\)
    else if (raw.startsWith('\\(') && raw.endsWith('\\)')) {
      out.push({ type: 'math', content: raw.slice(2, -2), displayMode: false });
    }
    // $...$
    else if (raw.startsWith('$') && raw.endsWith('$')) {
      out.push({ type: 'math', content: raw.slice(1, -1), displayMode: false });
    } else {
      // Fallback (shouldn't happen)
      out.push({ type: 'text', content: raw });
    }

    lastIdx = idx + raw.length;
  }

  if (lastIdx < s.length) {
    out.push({ type: 'text', content: s.slice(lastIdx) });
  }

  return out;
}

function extractDocumentBody(raw: string): { body: string; hasPreamble: boolean } {
  const s = String(raw ?? '');

  const begin = s.match(/\\begin\{document\}/);
  const end = s.match(/\\end\{document\}/);

  if (begin && end && begin.index != null && end.index != null && end.index > begin.index) {
    const body = s.slice(begin.index + begin[0].length, end.index);
    return { body: body.trim(), hasPreamble: begin.index > 0 };
  }

  // Heuristic fallback when \begin{document} is missing:
  // If it looks like a full LaTeX file, attempt to skip the preamble and jump to the first
  // "content-ish" marker (section/proof/align/etc). If none found, fall back to first blank line.
  const looksLikeFullTex = /\\documentclass|\\usepackage|\\hypersetup|\\newtheorem/.test(s);
  if (looksLikeFullTex) {
    const markers: RegExp[] = [
      /\\section\*?\{/,
      /\\subsection\*?\{/,
      /\\begin\{proof\}/,
      /\\begin\{theorem\}/,
      /\\begin\{lemma\}/,
      /\\begin\{proposition\}/,
      /\\begin\{definition\}/,
      /\\begin\{align\*?\}/,
      /\\begin\{equation\*?\}/,
    ];
    const indices = markers.map((r) => s.search(r)).filter((n) => typeof n === 'number' && n >= 0);
    const firstMarker = indices.length ? Math.min(...indices) : -1;

    if (firstMarker >= 0) {
      return { body: s.slice(firstMarker).trim(), hasPreamble: true };
    }

    const blankLine = s.search(/\n\s*\n/);
    if (blankLine >= 0) {
      return { body: s.slice(blankLine).trim(), hasPreamble: true };
    }
  }

  return { body: s, hasPreamble: false };
}

function normalizeLatexStructureForPreview(input: string): string {
  let s = String(input ?? '');

  // Turn sectioning commands into readable headings.
  // Keep it simple: render as plain text with spacing.
  s = s.replace(/\\section\*\{([^}]*)\}/g, (_m, title) => `\n\n## ${title}\n\n`);
  s = s.replace(/\\subsection\*\{([^}]*)\}/g, (_m, title) => `\n\n### ${title}\n\n`);
  s = s.replace(/\\subsubsection\*\{([^}]*)\}/g, (_m, title) => `\n\n#### ${title}\n\n`);

  // Quote environment: indent each line, avoid giant vertical gaps.
  s = s.replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g, (_m, inner) => {
    const lines = String(inner || '')
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (!lines.length) return '\n';
    return `\n${lines.map((l) => `> ${l}`).join('\n')}\n`;
  });

  // Common list environments: keep content, drop wrappers.
  s = s.replace(/\\begin\{(?:itemize|enumerate)\}/g, '\n');
  s = s.replace(/\\end\{(?:itemize|enumerate)\}/g, '\n');
  // \item -> bullet
  s = s.replace(/\\item\s+/g, '\n• ');

  // Remove a few layout-only commands that otherwise clutter preview.
  s = s.replace(/\\(?:smallskip|medskip|bigskip)\b/g, '\n');
  s = s.replace(/\\(?:noindent)\b/g, '');

  // Collapse excessive blank lines introduced by normalization.
  s = s.replace(/\n{3,}/g, '\n\n');

  return s;
}

export function WorkspacePreview({ content, className }: { content: string; className?: string }) {
  const macros = useMemo(() => extractKatexMacrosFromLatexDocument(content), [content]);
  const { body, hasPreamble } = useMemo(() => extractDocumentBody(content), [content]);
  const normalized = useMemo(() => normalizeLatexStructureForPreview(body), [body]);
  const segments = useMemo(() => splitLatexIntoSegments(normalized), [normalized]);

  // Rendering strategy:
  // - Inline math ($...$ and \(...\)) must stay inline with surrounding text.
  // - Display math ($$...$$ and \[...\]) should be its own block.
  // We therefore render segments as a sequence of “runs”:
  //   [inline run]* (display block) [inline run]* ...
  // Where an inline run is a mix of text + inline-math rendered inside a single
  // inline-flow container (so KaTeX doesn't get forced onto its own line).
  const runs = useMemo(() => {
    const out: Array<
      | { type: 'inlineRun'; items: Segment[] }
      | { type: 'displayMath'; item: Extract<Segment, { type: 'math' }> }
    > = [];

    let cur: Segment[] = [];
    const flush = () => {
      if (!cur.length) return;
      out.push({ type: 'inlineRun', items: cur });
      cur = [];
    };

    for (const seg of segments) {
      if (seg.type === 'math' && seg.displayMode) {
        flush();
        out.push({ type: 'displayMath', item: seg });
      } else {
        cur.push(seg);
      }
    }
    flush();
    return out;
  }, [segments]);

  return (
    <div
      className={cn(
        // Allow horizontal scrolling for long unbroken LaTeX tokens that would otherwise
        // look visually truncated inside the Radix ScrollArea (which uses overflow-hidden).
        'text-sm leading-relaxed max-w-full overflow-x-auto overflow-y-hidden',
        className,
      )}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {hasPreamble && (
        <div className="mb-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          This is a lightweight preview to help you read your draft as you write it.
          <br />
          It doesn’t run a full LaTeX compiler, so some commands may not render exactly.
        </div>
      )}

      {runs.map((run, i) => {
        if (run.type === 'displayMath') {
          const seg = run.item;
          const wrapped = `$$${seg.content}$$`;
          return (
            <KatexRenderer
              key={`dm-${i}`}
              content={wrapped}
              autoWrap={false}
              className="my-3"
              inline={false}
              macros={macros}
            />
          );
        }

        // Inline run: mix of text + inline math in the same flow.
        // Use a single block container (div) so newlines are preserved via CSS,
        // but inline math remains inline.
        return (
          <div key={`ir-${i}`} className="whitespace-pre-wrap font-sans text-foreground/90">
            {run.items.map((seg, j) => {
              if (seg.type === 'text') {
                return <span key={`t-${j}`}>{seg.content}</span>;
              }

              // Inline math
              const wrapped = `$${seg.content}$`;
              return (
                <KatexRenderer
                  key={`m-${j}`}
                  content={wrapped}
                  autoWrap={false}
                  className="inline"
                  inline={true}
                  macros={macros}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
