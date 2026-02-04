/**
 * Formatting helpers for proof streaming UI.
 *
 * The proof draft is plain text coming from the model. It often includes:
 * - Markdown headings (e.g. "### Step")
 * - LaTeX sectioning commands (e.g. "\\section{...}")
 * - LaTeX environments like claim/lemma/proposition
 *
 * We don't want a full LaTeX parser; we just normalize common patterns into
 * lightweight markdown that our existing chat renderer can display nicely.
 */

const replaceHeading = (name: string, level: number) => {
    const hashes = '#'.repeat(level);
    // e.g. \section{Title} -> ### Title
    const re = new RegExp(`\\\\${name}\\{([^}]*)\\}`, 'g');
    return (s: string) => s.replace(re, (_m, title) => `\n\n${hashes} ${String(title || '').trim()}\n\n`);
};

function normalizeEnvironments(input: string) {
    let s = input;

    const envToQuote = (env: 'claim' | 'lemma' | 'proposition', label: string) => {
        const re = new RegExp(`\\\\begin\\{${env}\\}([\\s\\S]*?)\\\\end\\{${env}\\}`, 'g');
        s = s.replace(re, (_m, body) => {
            let inner = String(body || '').trim();

            // Pull out an optional \label{...} so it doesn't render as raw TeX.
            let id: string | null = null;
            inner = inner.replace(/\\label\{([^}]*)\}/g, (_m2, g1) => {
                const t = String(g1 || '').trim();
                if (t) id = t;
                return '';
            });
            inner = inner.replace(/^\s*\n+|\n+\s*$/g, '').trim();

            const title = id ? `${label} (${id})` : label;
            const quoted = inner
                ? inner.split('\n').map((ln) => `> ${ln}`).join('\n')
                : '> (empty)';

            return `\n\n> **${title}.**\n>\n${quoted}\n\n`;
        });
    };

    envToQuote('claim', 'Claim');
    envToQuote('lemma', 'Lemma');
    envToQuote('proposition', 'Proposition');

    return s;
}

/**
 * Convert common LaTeX structure into markdown that renders well in the live stream.
 */
export function formatProofStreamText(input: string): string {
    let s = String(input ?? '');

    // De-duplicate some common model glitches like "f:[0,1]2→R≥0f:[0,1]2→R≥0" by collapsing
    // immediate repeated runs (no whitespace between them).
    // Keep this conservative to avoid harming legitimate short repetitions.
    s = s.replace(/(\S{10,160})(?:\1){1,}/g, '$1');

    // Sectioning -> headings
    s = replaceHeading('section', 3)(s);
    s = replaceHeading('subsection', 4)(s);
    s = replaceHeading('subsubsection', 5)(s);

    // Environments -> blockquotes
    s = normalizeEnvironments(s);

    // Remove standalone labels that might appear outside environments.
    s = s.replace(/^\s*\\label\{[^}]*\}\s*$/gm, '');

    // Ensure headings start on their own line (helps markdown renderers)
    s = s.replace(/\n?(#{2,6}\s+)/g, '\n$1');

    return s;
}
