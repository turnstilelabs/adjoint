'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SymPyOp = 'verify' | 'simplify' | 'solve' | 'diff' | 'integrate' | 'dsolve';

export type SymPySpec =
    | { op: 'verify'; lhs: string; rhs: string }
    | { op: 'simplify'; expr: string }
    | { op: 'solve'; lhs: string; rhs: string }
    | { op: 'diff'; expr: string; var?: string }
    | { op: 'integrate'; expr: string; var?: string }
    | { op: 'dsolve'; ode: string; func?: string; var?: string };

export type SymPyResult =
    | {
        ok: true;
        op: SymPyOp | 'preload';
        result_latex: string;
        result_text: string;
        meta?: {
            truth?: 'true' | 'false' | 'unknown';
            difference_latex?: string;
            difference_text?: string;
        };
        warnings?: string[];
    }
    | { ok: false; error: string };

type WorkerEnvelope =
    | { id: string; ok: true; result: any }
    | { id: string; ok: false; error: string };

function randomId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useSympyWorker() {
    const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const workerRef = useRef<Worker | null>(null);
    const pendingRef = useRef<Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>>(
        new Map(),
    );

    const workerVersion = 'v6';

    const ensureWorker = useCallback(() => {
        if (workerRef.current) return workerRef.current;
        // Cache-bust in dev so updated worker code is picked up reliably.
        const w = new Worker(`/workers/sympy-worker.js?${workerVersion}`);
        w.onmessage = (evt: MessageEvent<WorkerEnvelope>) => {
            const msg = evt?.data as any;
            const id = msg?.id;
            if (!id) return;
            const pending = pendingRef.current.get(id);
            if (!pending) return;
            pendingRef.current.delete(id);
            if (msg.ok) pending.resolve(msg.result);
            else pending.reject(new Error(msg.error || 'Worker error'));
        };
        w.onerror = (err: any) => {
            const message =
                (err && (err.message || err?.error?.message)) ||
                'SymPy worker failed to start. This can happen if the worker script has a syntax error or is blocked by the browser.';
            console.error('[SymPyWorker] error', err);
            setStatus('error');
            // Propagate a more useful reason to the UI.
            try {
                // eslint-disable-next-line no-throw-literal
                throw new Error(message);
            } catch {
                // ignore
            }
        };
        workerRef.current = w;
        return w;
    }, []);

    const resetWorker = useCallback(() => {
        try {
            workerRef.current?.terminate();
        } catch {
            // ignore
        }
        workerRef.current = null;
    }, []);

    const send = useCallback(
        (payload: any, opts?: { timeoutMs?: number }) => {
            const worker = ensureWorker();
            const id = randomId();
            const timeoutMs = opts?.timeoutMs ?? 25_000;

            return new Promise<any>((resolve, reject) => {
                pendingRef.current.set(id, { resolve, reject });
                worker.postMessage({ id, ...payload });

                const t = window.setTimeout(() => {
                    if (!pendingRef.current.has(id)) return;
                    pendingRef.current.delete(id);
                    try {
                        // Hard cancel: terminate and recreate on next call.
                        workerRef.current?.terminate();
                        workerRef.current = null;
                    } catch {
                        // ignore
                    }
                    setStatus('error');
                    reject(new Error('SymPy computation timed out'));
                }, timeoutMs);

                // Clear timeout when resolved/rejected
                const wrapResolve = (v: any) => {
                    window.clearTimeout(t);
                    resolve(v);
                };
                const wrapReject = (e: any) => {
                    window.clearTimeout(t);
                    reject(e);
                };
                pendingRef.current.set(id, { resolve: wrapResolve, reject: wrapReject });
            });
        },
        [ensureWorker],
    );

    const preload = useCallback(async () => {
        if (status === 'ready' || status === 'loading') return;
        setStatus('loading');
        try {
            await send({ type: 'preload' }, { timeoutMs: 60_000 });
            setStatus('ready');
        } catch (e) {
            console.error('[SymPyWorker] preload failed', e);
            setStatus('error');
        }
    }, [send, status]);

    const run = useCallback(
        async (spec: SymPySpec, opts?: { timeoutMs?: number }): Promise<SymPyResult> => {
            if (status === 'idle') {
                await preload();
            }
            if (status === 'error') {
                return { ok: false, error: 'SymPy engine failed to initialize.' };
            }
            try {
                const result = await send({ type: 'run', spec }, opts);
                return result as SymPyResult;
            } catch (e: any) {
                const msg = e?.message || 'SymPy execution failed.';

                // If the worker is stale and doesn't understand a new op, reset and retry once.
                if (/Unsupported op:\s*dsolve/i.test(msg)) {
                    try {
                        resetWorker();
                        const retry = await send({ type: 'run', spec }, opts);
                        return retry as SymPyResult;
                    } catch {
                        // fall through
                    }
                }

                return { ok: false, error: msg };
            }
        },
        [preload, resetWorker, send, status],
    );

    // Cleanup on unmount
    useEffect(() => {
        // Capture current refs to satisfy exhaustive-deps warning.
        const pending = pendingRef.current;
        return () => {
            try {
                workerRef.current?.terminate();
            } catch {
                // ignore
            }
            workerRef.current = null;
            pending.clear();
        };
    }, []);

    return { status, preload, run };
}
