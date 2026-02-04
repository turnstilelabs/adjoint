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

    // Claim environment
    s = s.replace(
        /\\begin\{claim\}([\s\S]*?)\\end\{claim\}/g,
        (_m, body) => {
            const inner = String(body || '').trim();
            return `\n\n> **Claim.**\n>\n> ${inner.replace(/\n/g, '\n> ')}\n\n`;
        },
    );

    // Lemma environment
    s = s.replace(
        /\\begin\{lemma\}([\s\S]*?)\\end\{lemma\}/g,
        (_m, body) => {
            const inner = String(body || '').trim();
            return `\n\n> **Lemma.**\n>\n> ${inner.replace(/\n/g, '\n> ')}\n\n`;
        },
    );

    // Proposition environment
    s = s.replace(
        /\\begin\{proposition\}([\s\S]*?)\\end\{proposition\}/g,
        (_m, body) => {
            const inner = String(body || '').trim();
            return `\n\n> **Proposition.**\n>\n> ${inner.replace(/\n/g, '\n> ')}\n\n`;
        },
    );

    return s;
}

/**
 * Convert common LaTeX structure into markdown that renders well in the live stream.
 */
export function formatProofStreamText(input: string): string {
    let s = String(input ?? '');

    // De-duplicate some common model glitches like "f:[0,1]2→R≥0f:[0,1]2→R≥0" by collapsing
    // immediate repeated tokens separated only by whitespace.
    s = s.replace(/(\S.{0,60}?)(\1)/g, '$1');

    // Sectioning -> headings
    s = replaceHeading('section', 3)(s);
    s = replaceHeading('subsection', 4)(s);
    s = replaceHeading('subsubsection', 5)(s);

    // Environments -> blockquotes
    s = normalizeEnvironments(s);

    // Ensure headings start on their own line (helps markdown renderers)
    s = s.replace(/\n?(#{2,6}\s+)/g, '\n$1');

    return s;
}
