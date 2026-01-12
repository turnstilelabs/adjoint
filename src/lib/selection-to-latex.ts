// Extract a LaTeX-ish string from a DOM selection that includes KaTeX.
// KaTeX stores source TeX in MathML annotations; we prefer that over visible text.

function normalizeUnicodeToLatex(text: string): string {
    return (text ?? '')
        .replace(/≥/g, '\\ge ')
        .replace(/≤/g, '\\le ')
        .replace(/∑/g, '\\sum ')
        .replace(/[–−]/g, '-')
        .replace(/[·×]/g, '\\cdot ')
        // strip common zero-width artifacts KaTeX sometimes leaves behind
        .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
}

function isDisplayKatex(el: Element): boolean {
    // KaTeX uses `katex-display` class for display mode.
    return Boolean(el.closest('.katex-display'));
}

function extractTexFromKatexElement(katexEl: Element): { tex: string; display: boolean } | null {
    // Prefer application/x-tex annotation (raw TeX).
    const annotation = katexEl.querySelector('annotation[encoding="application/x-tex"]');
    const tex = annotation?.textContent?.trim();
    if (!tex) return null;

    return { tex, display: isDisplayKatex(katexEl) };
}

function getSelectedSliceFromTextNode(node: Text, range: Range): string {
    const full = node.data ?? '';
    let start = 0;
    let end = full.length;

    // Most browsers place range boundaries in Text nodes.
    if (range.startContainer === node) start = Math.max(0, Math.min(full.length, range.startOffset));
    if (range.endContainer === node) end = Math.max(0, Math.min(full.length, range.endOffset));

    if (end < start) [start, end] = [end, start];
    return full.slice(start, end);
}

function safeIntersectsNode(range: Range, node: Node): boolean {
    try {
        // Standard API (Chrome/Firefox).
        return range.intersectsNode(node);
    } catch {
        // Safari can throw for some node types. Fall back to boundary comparisons.
        try {
            const nodeRange = document.createRange();
            nodeRange.selectNodeContents(node);
            // range.end > node.start && range.start < node.end
            const endsAfterNodeStarts =
                range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0;
            const startsBeforeNodeEnds =
                range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0;
            return endsAfterNodeStarts && startsBeforeNodeEnds;
        } catch {
            return false;
        }
    }
}

/**
 * Convert a selected DOM range into a more faithful LaTeX-ish plain text string.
 *
 * - Inline math becomes `$...$`
 * - Display math becomes `$$...$$`
 */
export function selectionRangeToLatex(range: Range): string {
    try {
        // `range.cloneContents()` is often missing KaTeX's hidden MathML layer.
        // Walk the live DOM and replace KaTeX nodes with their annotation TeX.

        const ancestor: Element | null =
            range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                ? (range.commonAncestorContainer as Element)
                : range.commonAncestorContainer.parentElement;

        if (!ancestor) return '';

        const emittedKatexRoots = new Set<Element>();
        const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);

        let out = '';
        while (walker.nextNode()) {
            const textNode = walker.currentNode as Text;
            // Skip nodes not touched by the selection.
            if (!safeIntersectsNode(range, textNode)) continue;

            const katexRoot = textNode.parentElement?.closest('.katex');
            if (katexRoot) {
                if (!emittedKatexRoots.has(katexRoot)) {
                    const info = extractTexFromKatexElement(katexRoot);
                    if (info?.tex) {
                        out += info.display ? `$$${info.tex}$$` : `$${info.tex}$`;
                    }
                    emittedKatexRoots.add(katexRoot);
                }
                // Do not include KaTeX's visual text nodes.
                continue;
            }

            out += getSelectedSliceFromTextNode(textNode, range);
        }

        const raw = out.replace(/\u00A0/g, ' ');
        return normalizeUnicodeToLatex(raw).replace(/\r\n/g, '\n').trim();
    } catch {
        // Final fallback: best-effort (may be visually mangled for KaTeX).
        try {
            return normalizeUnicodeToLatex(range.toString()).trim();
        } catch {
            return '';
        }
    }
}
