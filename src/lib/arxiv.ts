export type ParsedArxiv = {
    /** Canonical id, e.g. "2501.01234" or "math/0301234" */
    id: string;
    /** Optional version, e.g. "v2" */
    version?: string;
    /** Canonical printable form, e.g. "2501.01234v2" */
    canonical: string;
};

// New-style: YYMM.number(4-5) with optional vN.
// Old-style: archive/YYMMNNN with optional vN.
const NEW_STYLE_RE = /\b(\d{4}\.\d{4,5})(v\d+)?\b/i;
const OLD_STYLE_RE = /\b([a-z-]+\/\d{7})(v\d+)?\b/i;

/**
 * Parse an arXiv url/id from arbitrary text.
 *
 * Supports:
 * - https://arxiv.org/abs/2501.01234v2
 * - https://arxiv.org/pdf/2501.01234v2.pdf
 * - arXiv:2501.01234v2
 * - 2501.01234v2
 */
export function parseArxivId(text: string): ParsedArxiv | null {
    const s = String(text ?? '').trim();
    if (!s) return null;

    // Strip a few common wrappers.
    const normalized = s.replace(/^arxiv\s*:\s*/i, '').replace(/\.pdf\b/i, '');

    const mNew = normalized.match(NEW_STYLE_RE);
    if (mNew) {
        const id = mNew[1];
        const version = mNew[2] ? mNew[2].toLowerCase() : undefined;
        return { id, version, canonical: `${id}${version ?? ''}` };
    }

    const mOld = normalized.match(OLD_STYLE_RE);
    if (mOld) {
        const id = mOld[1].toLowerCase();
        const version = mOld[2] ? mOld[2].toLowerCase() : undefined;
        return { id, version, canonical: `${id}${version ?? ''}` };
    }

    return null;
}

export function arxivEprintUrl(parsed: ParsedArxiv): string {
    const id = parsed.canonical;
    // Prefer export.arxiv.org to avoid arxiv.org anti-bot challenges.
    return `https://export.arxiv.org/e-print/${encodeURIComponent(id)}`;
}
