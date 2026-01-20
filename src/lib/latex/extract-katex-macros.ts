/**
 * Extract a *safe* subset of LaTeX macro definitions from a document and return
 * a KaTeX-compatible `macros` map.
 *
 * Intentionally supported (0-argument only):
 *   - \newcommand{\name}{replacement}
 *   - \renewcommand{\name}{replacement}
 *   - \providecommand{\name}{replacement}
 *
 * Not supported (ignored):
 *   - Any command with optional [n] argument counts
 *   - \def / \DeclareMathOperator etc.
 *   - Package execution / preamble code (we never execute LaTeX)
 */

export type KatexMacros = Record<string, string>;

function stripLatexComments(input: string): string {
    // Remove LaTeX comments but keep escaped \%.
    return String(input ?? '')
        .split(/\r?\n/)
        .map((line) => {
            const idx = line.indexOf('%');
            if (idx < 0) return line;
            if (idx > 0 && line[idx - 1] === '\\') return line;
            return line.slice(0, idx);
        })
        .join('\n');
}

/**
 * Parse a {...} group starting at `start` (where input[start] === '{').
 * Handles nested braces.
 */
function readBraceGroup(input: string, start: number): { value: string; end: number } | null {
    if (input[start] !== '{') return null;
    let depth = 0;
    let i = start;
    for (; i < input.length; i++) {
        const ch = input[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return { value: input.slice(start + 1, i), end: i + 1 };
            }
        }
    }
    return null;
}

/**
 * Extract 0-arg macro definitions from a LaTeX document.
 *
 * Defensive: never throws; on unexpected syntax just returns what it can.
 */
export function extractKatexMacrosFromLatexDocument(raw: unknown): KatexMacros {
    try {
        const doc = stripLatexComments(String(raw ?? ''));
        const out: KatexMacros = {};

        // Scan for occurrences of \newcommand / \renewcommand / \providecommand.
        // We intentionally avoid a single giant regex for the replacement body because
        // it can contain nested braces.
        const cmdRe = /\\(newcommand|renewcommand|providecommand)\b/g;
        let m: RegExpExecArray | null;
        while ((m = cmdRe.exec(doc))) {
            let i = (m.index ?? 0) + m[0].length;

            // Optional whitespace
            while (i < doc.length && /\s/.test(doc[i]!)) i++;

            // If the next non-space is '[', this is an arg-count or optional parameter -> ignore.
            // Example: \newcommand{\foo}[1]{...}
            // Note: if the '[' comes after the name group, we also ignore (see below).

            // Expect {\name}
            if (doc[i] !== '{') continue;
            const nameGroup = readBraceGroup(doc, i);
            if (!nameGroup) continue;
            const rawName = nameGroup.value.trim();
            i = nameGroup.end;

            // Basic validation: macro name should look like "\\foo".
            if (!/^\\[A-Za-z@]+$/.test(rawName)) continue;

            // Skip whitespace
            while (i < doc.length && /\s/.test(doc[i]!)) i++;

            // Optional arg-count [n] -> not supported
            if (doc[i] === '[') continue;

            // Expect {replacement}
            if (doc[i] !== '{') continue;
            const replGroup = readBraceGroup(doc, i);
            if (!replGroup) continue;
            const replacement = replGroup.value;

            // KaTeX expects the macro keys to include the leading backslash.
            out[rawName] = replacement;

            // Continue scanning after the replacement group.
            cmdRe.lastIndex = replGroup.end;
        }

        return out;
    } catch {
        return {};
    }
}

