// Helpers for extracting a context snippet from a LaTeX-like document.

/**
 * Remove most preamble and macro definitions.
 * Heuristic: drop bulky setup while keeping the main math/prose.
 */
export function stripLatexPreambleAndMacros(raw: string): string {
    let s = String(raw ?? '');

    // If it's a full document, prefer extracting its body.
    const begin = s.match(/\\begin\{document\}/);
    const end = s.match(/\\end\{document\}/);
    if (begin && end && begin.index != null && end.index != null && end.index > begin.index) {
        s = s.slice(begin.index + begin[0].length, end.index);
    }

    // Always remove any remaining stray document markers.
    s = s.replace(/\\begin\{document\}/g, '');
    s = s.replace(/\\end\{document\}/g, '');

    // Drop common preamble/macros lines.
    // Note: We keep the content of theorem environments etc in the body.
    const dropLine = (line: string) =>
        /^\s*\\(?:documentclass|usepackage|RequirePackage|input|include|bibliography|bibliographystyle|title|author|date|maketitle|tableofcontents|listoffigures|listoftables)\b/.test(
            line,
        ) ||
        /^\s*\\(?:newcommand|renewcommand|providecommand|def|edef|gdef|xdef|let|DeclareMathOperator|DeclareMathOperator\*)\b/.test(
            line,
        ) ||
        /^\s*\\(?:newtheorem|theoremstyle)\b/.test(line) ||
        /^\s*\\(?:hypersetup|geometry|setlength|addtolength|parindent|parskip)\b/.test(line);

    const lines = s.split(/\r?\n/);
    const filtered = lines.filter((l) => !dropLine(l));
    s = filtered.join('\n');

    // Remove comments but keep escaped \%.
    s = s
        .split(/\r?\n/)
        .map((line) => {
            const idx = line.indexOf('%');
            if (idx < 0) return line;
            // if percent is escaped, keep it.
            if (idx > 0 && line[idx - 1] === '\\') return line;
            return line.slice(0, idx);
        })
        .join('\n');

    // Collapse excessive whitespace.
    // Remove a few common wrapper environments that are usually just formatting.
    // (We keep their *content*.)
    s = s.replace(/\\begin\{quote\}/g, '');
    s = s.replace(/\\end\{quote\}/g, '');

    // Collapse excessive whitespace.
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
}

/**
 * Extract contextual text that comes *before* a selection.
 * Used to give the prover additional definitions/assumptions leading up to the statement.
 */
export function contextBeforeSelection(opts: {
    doc: string;
    selectionStart: number;
    maxChars?: number;
    stripMacros?: boolean;
}): string {
    const doc = String(opts.doc ?? '');
    const start = Math.max(0, Math.min(opts.selectionStart ?? 0, doc.length));
    const maxChars = Math.max(200, opts.maxChars ?? 6000);

    const from = Math.max(0, start - maxChars);
    let ctx = doc.slice(from, start);
    if (opts.stripMacros !== false) ctx = stripLatexPreambleAndMacros(ctx);
    return ctx.trim();
}
