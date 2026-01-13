// Shared LaTeX normalization helpers for KaTeX rendering.
//
// Goal: convert common LaTeX delimiter/environment forms into patterns that our
// KaTeX renderer understands consistently (primarily $...$ / $$...$$).
//
// Important note about AMS environments:
// - KaTeX supports `aligned` inside math mode, but does not fully implement the
//   full LaTeX `align` environment semantics.
// - We therefore rewrite `\begin{align}` / `\begin{align*}` blocks into
//   `$$\begin{aligned} ... \end{aligned}$$`.

/**
 * Normalize a LaTeX-ish string into a form that is easier to segment and render
 * with KaTeX.
 *
 * Currently normalizes:
 * - ```math ...``` / ```latex ...``` fenced blocks -> $$...$$
 * - \[ ... \] -> $$...$$
 * - \( ... \) -> $...$
 * - \begin{align}/\begin{align*} ... \end{align}/\end{align*} -> $$\begin{aligned}...\end{aligned}$$
 * - \begin{equation}/\begin{equation*} ... \end{equation}/\end{equation*} -> $$...$$
 * - \begin{gather}/\begin{gather*} ... \end{gather}/\end{gather*} -> $$...$$
 */
export function normalizeLatexForKatex(input: unknown): string {
    // Defensive: some call sites may pass null/undefined (e.g. while loading / resuming views).
    let s = typeof input === 'string' ? input : String(input ?? '');

    // Fenced code blocks for math/latex
    // Accepts optional spaces after the language tag and requires a newline before the block body.
    s = s.replace(/```(?:math|latex)[\t ]*\r?\n([\s\S]*?)```/g, (_m, g1) => `$$${g1}$$`);

    // \[ ... \] -> $$ ... $$
    s = s.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, g1) => `$$${g1}$$`);

    // \( ... \) -> $ ... $
    s = s.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, g1) => `$${g1}$`);

    // AMS align environment -> aligned inside display math.
    // We accept optional whitespace after \begin{align*} etc.
    // Non-greedy inner match so multiple environments can coexist.
    s = s.replace(
        /\\begin\{align\*?\}\s*([\s\S]*?)\s*\\end\{align\*?\}/g,
        (_m, inner) => `$$\\begin{aligned}${String(inner ?? '')}\\end{aligned}$$`,
    );

    // Other common display-math environments: equation / gather.
    // KaTeX understands their content when wrapped in display math; the environment
    // wrappers themselves are not needed for our preview.
    s = s.replace(/\\begin\{equation\*?\}\s*([\s\S]*?)\s*\\end\{equation\*?\}/g, (_m, inner) => `$$${inner}$$`);
    s = s.replace(/\\begin\{gather\*?\}\s*([\s\S]*?)\s*\\end\{gather\*?\}/g, (_m, inner) => `$$${inner}$$`);

    return s;
}

