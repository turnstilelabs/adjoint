export type ArtifactType =
    | 'theorem'
    | 'lemma'
    | 'proposition'
    | 'corollary'
    | 'claim';

export type Artifact = {
    type: ArtifactType;

    /** Raw env name as seen in \begin{...} (plus star(s) if present). */
    envName: string;
    /** Optional arg [..] after \begin{env}. */
    title?: string | null;
    /** First \label{...} in the artifact body. */
    label?: string | null;
    /** Trimmed body text between \begin and \end tags. */
    content: string;

    /** Proof body if linked (trimmed). */
    proof?: string | null;
};

/**
 * Internal representation used by the Workspace Review panel.
 *
 * We keep character offsets so edits can be spliced back into the original document.
 */
export type ExtractedArtifact = Artifact & {
    artifactStartChar: number;
    artifactEndChar: number;

    bodyStartChar: number;
    bodyEndChar: number;

    /** Offsets for the linked proof block (if any). */
    proofBlock?: {
        startChar: number;
        endChar: number;
        bodyStartChar: number;
        bodyEndChar: number;
    } | null;
};

export type ProofBlock = {
    content: string;
    optionalArg: string | null;
    startChar: number;
    endChar: number;
    bodyStartChar: number;
    bodyEndChar: number;
    used: boolean;
};

export type ArtifactReviewVerdict = 'OK' | 'ISSUE' | 'UNCLEAR';

export type ArtifactReviewCategory = {
    verdict: ArtifactReviewVerdict;
    feedback: string;
};

export type ArtifactReviewResult = {
    verdict: ArtifactReviewVerdict;
    summary: string;
    correctness: ArtifactReviewCategory;
    clarity: ArtifactReviewCategory;
    suggestedImprovement?: string;
    model?: string | null;
    timestamp: string; // ISO
};
