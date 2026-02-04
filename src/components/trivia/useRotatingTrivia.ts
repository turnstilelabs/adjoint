import { useEffect, useMemo, useState } from 'react';

import { shuffleTrivia, type MathTriviaItem } from '@/lib/math-trivia';

type TriviaState = {
    items: MathTriviaItem[];
    loadedAt: number;
};

// Lightweight module-level cache to avoid refetching on every chat send.
// (Still uses no-store at the network layer; this is purely in-memory.)
let cached: TriviaState | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

export function clearTriviaCache() {
    cached = null;
}

export function useRotatingTrivia(opts: {
    enabled: boolean;
    rotateEveryMs?: number;
}) {
    const enabled = Boolean(opts.enabled);
    const rotateEveryMs = opts.rotateEveryMs ?? 10000;

    const [items, setItems] = useState<MathTriviaItem[]>([]);
    const [index, setIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Load trivia when enabled.
    useEffect(() => {
        if (!enabled) return;

        const now = Date.now();
        if (cached && now - cached.loadedAt < CACHE_TTL_MS && Array.isArray(cached.items) && cached.items.length > 0) {
            setItems(cached.items);
            setIndex(0);
            setError(null);
            return;
        }

        let cancelled = false;
        setError(null);
        setItems([]);
        setIndex(0);

        (async () => {
            try {
                const resp = await fetch('/api/trivia', { cache: 'no-store' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const raw = (await resp.json()) as unknown;
                if (!Array.isArray(raw)) throw new Error('Malformed trivia dataset');
                const shuffled = shuffleTrivia(raw as MathTriviaItem[]);
                if (cancelled) return;
                cached = { items: shuffled, loadedAt: Date.now() };
                setItems(shuffled);
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : String(e));
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled]);

    // Rotate.
    useEffect(() => {
        if (!enabled) return;
        if (!items.length) return;
        const id = window.setInterval(() => setIndex((i) => i + 1), rotateEveryMs);
        return () => window.clearInterval(id);
    }, [enabled, items.length, rotateEveryMs]);

    const current = useMemo(() => {
        if (!items.length) return null;
        const i = ((index % items.length) + items.length) % items.length;
        return items[i] ?? null;
    }, [items, index]);

    return {
        item: current,
        error,
        isLoaded: items.length > 0,
    } as const;
}
