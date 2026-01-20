import type { ArtifactType, ExtractedArtifact, ProofBlock } from '@/types/review';

// --- Step 0: strip comments -------------------------------------------------
// IMPORTANT: we preserve string length so extracted character offsets remain valid
// for splicing edits back into the original Workspace document.
//
// Remove %... to end-of-line when % is not escaped.
// Node 16+ supports negative lookbehind.
const stripCommentsPreserveLength = (latex: string): string => {
    const s = String(latex ?? '');
    return s.replace(/(?<!\\)%.*$/gm, (m) => ' '.repeat(m.length));
};

// --- Aliases ----------------------------------------------------------------
// Keep this conservative for v0.
const STATIC_ALIASES: Record<string, ArtifactType> = {
    thm: 'theorem',
    theorem: 'theorem',
    lem: 'lemma',
    lemma: 'lemma',
    prop: 'proposition',
    proposition: 'proposition',
    cor: 'corollary',
    corollary: 'corollary',
    claim: 'claim',
};

const CANONICAL_TYPES = new Set<ArtifactType>([
    'theorem',
    'lemma',
    'proposition',
    'corollary',
    'claim',
]);

const NEWTHEOREM_RE = /\\newtheorem\s*\{([^}]+)\}\s*(?:\[[^\]]+\])?\s*\{([^}]+)\}/g;

const toCanonicalTypeFromTitle = (title: string): ArtifactType | null => {
    const t = String(title ?? '').toLowerCase();
    if (t.includes('theorem')) return 'theorem';
    if (t.includes('lemma')) return 'lemma';
    if (t.includes('proposition') || t.includes('prop.')) return 'proposition';
    if (t.includes('corollary') || t.includes('cor.')) return 'corollary';
    if (t.includes('claim')) return 'claim';
    return null;
};

const buildDynamicAliases = (latex: string): Record<string, ArtifactType> => {
    const out: Record<string, ArtifactType> = {};
    const s = String(latex ?? '');
    for (const m of s.matchAll(NEWTHEOREM_RE)) {
        const env = (m[1] ?? '').trim();
        const title = (m[2] ?? '').trim();
        if (!env || !title) continue;
        if (out[env]) continue; // first wins
        const canonical = toCanonicalTypeFromTitle(title);
        if (!canonical) continue;
        out[env] = canonical;
    }
    return out;
};

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Step 3: matching end tag with nesting counter --------------------------
function findMatchingEnd(opts: {
    latex: string;
    rawEnvName: string;
    star: string | null;
    searchFrom: number;
}): { endTagStart: number; endTagEnd: number } | null {
    const { latex, rawEnvName, star, searchFrom } = opts;
    const envFull = `${rawEnvName}${star ?? ''}`;
    const beginToken = `\\begin{${envFull}}`;
    const endToken = `\\end{${envFull}}`;

    let nesting = 1;
    let cursor = searchFrom;

    while (cursor < latex.length) {
        const nextBegin = latex.indexOf(beginToken, cursor);
        const nextEnd = latex.indexOf(endToken, cursor);

        if (nextEnd === -1) return null;

        if (nextBegin !== -1 && nextBegin < nextEnd) {
            nesting += 1;
            cursor = nextBegin + beginToken.length;
            continue;
        }

        // next end
        nesting -= 1;
        if (nesting === 0) {
            return { endTagStart: nextEnd, endTagEnd: nextEnd + endToken.length };
        }
        cursor = nextEnd + endToken.length;
    }

    return null;
}

const LABEL_RE = /\\label\s*\{([^}]+)\}/;
const REF_IN_TEXT_RE = /\\(?:[cC]ref|[vV]ref|[Aa]utoref|ref)\s*\{([^}]+)\}/g;

export function extractLatexArtifacts(rawLatex: string): ExtractedArtifact[] {
    // Step 0
    const withoutComments = stripCommentsPreserveLength(rawLatex);

    // Step 1
    const dynamicAliases = buildDynamicAliases(withoutComments);
    const envAliases: Record<string, ArtifactType> = {
        ...STATIC_ALIASES,
        ...dynamicAliases,
    };

    // Step 2
    const envNames = Array.from(
        new Set<string>([
            ...Array.from(CANONICAL_TYPES),
            ...Object.keys(envAliases),
            'proof',
        ]),
    );

    const ENV_ALTERNATION = envNames.map(escapeRegex).sort().join('|');

    // Note: we intentionally capture the star(s) outside the {} group.
    // Optional title is the [..] arg.
    const BEGIN_RE = new RegExp(String.raw`\\begin\{(${ENV_ALTERNATION})\}(\*+)?(?:\[([^\]]*)\])?`, 'g');

    const artifacts: ExtractedArtifact[] = [];
    const proofs: ProofBlock[] = [];

    let m: RegExpExecArray | null;
    while ((m = BEGIN_RE.exec(withoutComments))) {
        const rawEnvName = String(m[1] ?? '');
        const star = (m[2] ?? null) as string | null;
        const optionalTitleOrArg = (m[3] ?? null) as string | null;

        const beginIndex = m.index ?? 0;
        const bodyStart = BEGIN_RE.lastIndex;

        const matchEnd = findMatchingEnd({
            latex: withoutComments,
            rawEnvName,
            star,
            searchFrom: bodyStart,
        });
        if (!matchEnd) {
            // No end tag: skip
            continue;
        }

        const bodyEnd = matchEnd.endTagStart;
        const endTagEnd = matchEnd.endTagEnd;

        const envFullName = `${rawEnvName}${star ?? ''}`;

        // Handle proof blocks separately (Step 5.1)
        if (rawEnvName.toLowerCase() === 'proof') {
            const proofBody = withoutComments.slice(bodyStart, bodyEnd).trim();
            proofs.push({
                content: proofBody,
                optionalArg: optionalTitleOrArg,
                startChar: beginIndex,
                endChar: endTagEnd,
                bodyStartChar: bodyStart,
                bodyEndChar: bodyEnd,
                used: false,
            });
            BEGIN_RE.lastIndex = endTagEnd;
            continue;
        }

        const canonical = (envAliases[rawEnvName] ?? rawEnvName).toLowerCase() as ArtifactType;
        if (!CANONICAL_TYPES.has(canonical)) {
            BEGIN_RE.lastIndex = endTagEnd;
            continue;
        }

        const body = withoutComments.slice(bodyStart, bodyEnd).trim();
        const labelMatch = body.match(LABEL_RE);
        const label = labelMatch?.[1] ? String(labelMatch[1]).trim() : null;

        artifacts.push({
            type: canonical,
            envName: envFullName,
            title: optionalTitleOrArg,
            label,
            content: body,
            proof: null,

            artifactStartChar: beginIndex,
            artifactEndChar: endTagEnd,
            bodyStartChar: bodyStart,
            bodyEndChar: bodyEnd,
            proofBlock: null,
        });

        BEGIN_RE.lastIndex = endTagEnd;
    }

    // Step 5.2 Pass A: semantic linking via optional arg
    const labelToIdx = new Map<string, number>();
    artifacts.forEach((a, idx) => {
        const l = (a.label ?? '').trim();
        if (l) labelToIdx.set(l, idx);
    });

    for (const proof of proofs) {
        if (!proof.optionalArg) continue;
        let foundIdx: number | null = null;
        for (const mm of proof.optionalArg.matchAll(REF_IN_TEXT_RE)) {
            const group = String(mm[1] ?? '');
            const labels = group
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
            for (const l of labels) {
                const idx = labelToIdx.get(l);
                if (idx != null) {
                    foundIdx = idx;
                    break;
                }
            }
            if (foundIdx != null) break;
        }

        if (foundIdx != null) {
            const a = artifacts[foundIdx];
            if (a && !a.proof) {
                a.proof = proof.content;
                a.proofBlock = {
                    startChar: proof.startChar,
                    endChar: proof.endChar,
                    bodyStartChar: proof.bodyStartChar,
                    bodyEndChar: proof.bodyEndChar,
                };
                proof.used = true;
            }
        }
    }

    // Step 5.2 Pass B: proximity linking
    const sortedArtifacts = [...artifacts].sort((a, b) => a.artifactStartChar - b.artifactStartChar);
    const sortedProofs = [...proofs].sort((a, b) => a.startChar - b.startChar);

    let pIdx = 0;
    for (let i = 0; i < sortedArtifacts.length; i++) {
        const art = sortedArtifacts[i];
        if (art.proof) continue;

        const nodeEnd = art.artifactEndChar;
        const nextNodeStart = (sortedArtifacts[i + 1]?.artifactStartChar ?? withoutComments.length);

        while (pIdx < sortedProofs.length && sortedProofs[pIdx].startChar <= nodeEnd) pIdx += 1;

        const candidate = sortedProofs[pIdx];
        if (!candidate) continue;
        if (candidate.used) continue;
        if (candidate.optionalArg != null) continue;

        if (nodeEnd < candidate.startChar && candidate.startChar < nextNodeStart) {
            // Attach
            art.proof = candidate.content;
            art.proofBlock = {
                startChar: candidate.startChar,
                endChar: candidate.endChar,
                bodyStartChar: candidate.bodyStartChar,
                bodyEndChar: candidate.bodyEndChar,
            };
            candidate.used = true;
        }
    }

    return artifacts;
}
