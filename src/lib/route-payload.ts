/**
 * Helpers for passing large payloads between routes without putting them in the URL.
 *
 * Motivation:
 * - Very large query strings (e.g. /prove?q=...) can crash browsers (observed in Firefox)
 *   and/or exceed proxy/header limits.
 * - For in-app navigation we can store the payload in sessionStorage and navigate with a
 *   short id (sid).
 *
 * Note:
 * - sessionStorage is per-tab, so links containing only sid are NOT shareable.
 *   (Shareable links would require server-side persistence; see future /api/share.)
 */

export const ROUTE_PAYLOAD_MAX_QUERY_CHARS = 1800;

const KEY_PREFIX = 'adjoint.routePayload.v1.';
const TTL_MS = 10 * 60 * 1000; // 10 minutes

type StoredPayload = {
    v: 1;
    ts: number;
    text: string;
};

function safeSessionGet(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSessionSet(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function safeSessionRemove(key: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function uuid(): string {
    // Short, non-cryptographic id is fine for ephemeral sessionStorage keys.
    return 's' + Math.random().toString(36).slice(2, 10);
}

export function storeRoutePayload(text: string): string | null {
    const t = String(text ?? '');
    if (!t.trim()) return null;

    const id = uuid();
    const key = KEY_PREFIX + id;
    const payload: StoredPayload = { v: 1, ts: Date.now(), text: t };
    safeSessionSet(key, JSON.stringify(payload));
    return id;
}

export function loadRoutePayload(id: string, opts?: { consume?: boolean }): string | null {
    const sid = String(id ?? '').trim();
    if (!sid) return null;

    const key = KEY_PREFIX + sid;
    const raw = safeSessionGet(key);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as StoredPayload;
        if (!parsed || parsed.v !== 1) return null;
        if (typeof parsed.ts !== 'number') return null;
        if (Date.now() - parsed.ts > TTL_MS) {
            safeSessionRemove(key);
            return null;
        }
        const text = String(parsed.text ?? '');
        if (opts?.consume !== false) safeSessionRemove(key);
        return text;
    } catch {
        return null;
    }
}
