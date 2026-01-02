export type MathTriviaKind = 'video' | 'article' | 'social';

export type MathTriviaItem = {
    id: string;
    kind: MathTriviaKind;
    title: string;
    blurb: string;
    url: string;
    tags?: string[];
};

/** Fisher–Yates shuffle (non-mutating). */
export function shuffleTrivia(items: MathTriviaItem[], rng: () => number = Math.random): MathTriviaItem[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
    return a;
}

