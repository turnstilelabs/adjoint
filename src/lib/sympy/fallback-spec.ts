import type { SymPySpec } from '@/hooks/useSympyWorker';

// Extremely small offline fallback (no LLM) when the model is unavailable.
// Goal: cover the common selections we see in UI, especially simple ODEs.

function stripDelimiters(s: string): string {
    let t = String(s ?? '').trim();
    // Strip $...$ or $$...$$ if present.
    if (t.startsWith('$$') && t.endsWith('$$') && t.length >= 4) t = t.slice(2, -2).trim();
    else if (t.startsWith('$') && t.endsWith('$') && t.length >= 2) t = t.slice(1, -1).trim();
    return t;
}

function normalizeQuotesAndSpaces(s: string): string {
    return String(s ?? '')
        .replace(/\u00A0/g, ' ')
        .replace(/[“”]/g, '"')
        .replace(/[’]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function pickText(selectionLatex: string, selectionText: string): string {
    const a = normalizeQuotesAndSpaces(stripDelimiters(selectionLatex));
    const b = normalizeQuotesAndSpaces(selectionText);
    return a.length >= b.length ? a : b;
}

function extractLikelyEquationSubstring(s: string): string {
    const t = normalizeQuotesAndSpaces(s);
    // If there is a clear equation, try to extract around the first '='.
    const eqIdx = t.indexOf('=');
    if (eqIdx >= 0) {
        // Expand left/right until we hit a sentence boundary.
        const leftBoundary = Math.max(
            t.lastIndexOf(':', eqIdx),
            t.lastIndexOf('.', eqIdx),
            t.lastIndexOf('\n', eqIdx),
        );
        const rightCandidates = [t.indexOf('.', eqIdx), t.indexOf('\n', eqIdx)].filter((x) => x >= 0) as number[];
        const rightBoundary = rightCandidates.length ? Math.min(...rightCandidates) : -1;
        const start = leftBoundary >= 0 ? leftBoundary + 1 : 0;
        const end = rightBoundary >= 0 ? rightBoundary : t.length;
        const candidate = t.slice(start, end).trim();
        // Only keep if it still has '='
        if (candidate.includes('=')) return candidate;
    }
    return t;
}

function extractEquation(s: string): { lhs: string; rhs: string } | null {
    const idx = s.indexOf('=');
    if (idx < 0) return null;
    const lhs = s.slice(0, idx).trim();
    const rhs = s.slice(idx + 1).trim();
    if (!lhs || !rhs) return null;
    return { lhs, rhs };
}

export function fallbackSelectionToSympySpec(input: {
    selectionLatex: string;
    selectionText: string;
}): SymPySpec | null {
    const raw = pickText(input.selectionLatex, input.selectionText);
    const s = extractLikelyEquationSubstring(raw);
    if (!s) return null;

    // Heuristic: ODE markers
    // e.g. y'' + 9y = 0, y' = y, y'' - y = 0
    if (/\b[A-Za-z]\s*'{1,3}/.test(s) && s.includes('=')) {
        // Default to dsolve
        // Detect function name (single letter) before prime.
        const m = s.match(/\b([A-Za-z])\s*'{1,3}/);
        const func = m?.[1] ?? 'y';
        // Try to infer variable: mention of x or t in text, else x.
        const varName = /\b(t|x)\b/.exec(s)?.[1] ?? 'x';
        return { op: 'dsolve', ode: s, func, var: varName };
    }

    // If equality, default to verify.
    const eq = extractEquation(s);
    if (eq) {
        return { op: 'verify', lhs: eq.lhs, rhs: eq.rhs };
    }

    // Otherwise simplify.
    return { op: 'simplify', expr: s };
}
