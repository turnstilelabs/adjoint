/**
 * Conservative splitter for candidate statements.
 *
 * The model sometimes returns a single string that contains multiple statements
 * (e.g. newline-separated or bullet list). We use this to:
 * - render each statement as its own item
 * - support deleting a single statement reliably
 */
export function splitStatements(input: string): string[] {
    const normalized = (input ?? '').replace(/\r\n/g, '\n');

    // First split on (one or more) newlines.
    const lines = normalized
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);

    const out: string[] = [];
    for (const line of lines) {
        // Match bullets: -, *, • followed by space; or simple numbered like "1. text"
        const m = line.match(/^(?:[-*•]\s+|\d+\.\s+)(.*)$/);
        if (m && m[1]) out.push(m[1].trim());
        else out.push(line);
    }

    // Deduplicate and remove empties.
    return Array.from(new Set(out.map((s) => s.trim()).filter(Boolean)));
}

