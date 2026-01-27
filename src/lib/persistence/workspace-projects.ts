/**
 * Workspace projects persistence (local-only).
 *
 * Goals:
 * - Versioned localStorage keys.
 * - Safe parsing (never throw).
 * - Backward-compatible migration from legacy workspace autosave keys.
 * - Keep payload sizes bounded (messages capped).
 */

import type { Message } from '@/components/chat/interactive-chat';

export type WorkspaceProjectMeta = {
    id: string;
    title: string;
    updatedAt: number; // epoch ms
    /** Reserved for future use (e.g. “Current draft” semantics). */
    kind?: 'draft' | 'project';
};

export type WorkspaceProjectUiState = {
    isChatOpen?: boolean;
    rightPanelTab?: 'chat' | 'insights' | 'preview' | 'review';
    rightPanelWidth?: number;
};

export type WorkspaceProjectPayload = {
    doc: string;
    messages: Message[];
    uiState?: WorkspaceProjectUiState;
};

const KEY_INDEX = 'adjoint.workspace.projects.v1';
const KEY_CURRENT_ID = 'adjoint.workspace.currentId.v1';
const keyProject = (id: string) => `adjoint.workspace.project.${id}.v1`;

// Legacy keys (currently used by workspace-view.tsx)
const LEGACY_DOC = 'adjoint.workspace.doc';
const LEGACY_MESSAGES = 'adjoint.workspace.messages';

const DEFAULT_TITLE = 'Untitled';
const MAX_MESSAGES = 200;

const safeJsonParse = <T>(raw: string | null): T | null => {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

const now = () => Date.now();

const uuid = () => 'p' + Math.random().toString(36).slice(2, 10);

const clampMessages = (messages: Message[] | null | undefined): Message[] => {
    const arr = Array.isArray(messages) ? messages : [];
    const safe = arr
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
        .map((m: any) => ({
            role: m.role,
            content: String(m.content ?? ''),
            // Never persist typing state.
            isTyping: false,
        })) as Message[];
    if (safe.length <= MAX_MESSAGES) return safe;
    return safe.slice(-MAX_MESSAGES);
};

const safeGet = (k: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(k);
    } catch {
        return null;
    }
};

const safeSet = (k: string, v: string): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(k, v);
    } catch {
        // ignore
    }
};

const safeRemove = (k: string): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(k);
    } catch {
        // ignore
    }
};

export function listWorkspaceProjects(): WorkspaceProjectMeta[] {
    const raw = safeGet(KEY_INDEX);
    const parsed = safeJsonParse<WorkspaceProjectMeta[]>(raw);
    const metas = Array.isArray(parsed) ? parsed : [];

    // sanitize + sort
    const safe = metas
        .filter((m: any) => m && typeof m.id === 'string')
        .map((m: any) => ({
            id: String(m.id),
            title: String(m.title || DEFAULT_TITLE),
            updatedAt: typeof m.updatedAt === 'number' ? m.updatedAt : 0,
            kind: m.kind === 'draft' ? 'draft' : 'project',
        })) as WorkspaceProjectMeta[];

    return safe.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getCurrentWorkspaceProjectId(): string | null {
    const raw = safeGet(KEY_CURRENT_ID);
    const id = String(raw || '').trim();
    return id || null;
}

export function setCurrentWorkspaceProjectId(id: string | null): void {
    if (!id) {
        safeRemove(KEY_CURRENT_ID);
        return;
    }
    safeSet(KEY_CURRENT_ID, String(id));
}

export function loadWorkspaceProject(id: string): WorkspaceProjectPayload | null {
    const raw = safeGet(keyProject(id));
    const parsed = safeJsonParse<WorkspaceProjectPayload>(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
        doc: String((parsed as any).doc ?? ''),
        messages: clampMessages((parsed as any).messages),
        uiState: (parsed as any).uiState && typeof (parsed as any).uiState === 'object'
            ? ((parsed as any).uiState as WorkspaceProjectUiState)
            : undefined,
    };
}

export function upsertWorkspaceProjectMeta(meta: WorkspaceProjectMeta): void {
    const all = listWorkspaceProjects();
    const idx = all.findIndex((m) => m.id === meta.id);
    const next: WorkspaceProjectMeta = {
        id: meta.id,
        title: String(meta.title || DEFAULT_TITLE),
        updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : now(),
        kind: meta.kind === 'draft' ? 'draft' : 'project',
    };

    const merged = idx >= 0 ? all.map((m, i) => (i === idx ? { ...m, ...next } : m)) : [next, ...all];
    safeSet(KEY_INDEX, JSON.stringify(merged));
}

export function saveWorkspaceProject(id: string, payload: WorkspaceProjectPayload): void {
    const doc = String(payload?.doc ?? '');
    const messages = clampMessages(payload?.messages);
    const uiState = payload?.uiState;

    safeSet(
        keyProject(id),
        JSON.stringify({
            doc,
            messages,
            uiState,
        } satisfies WorkspaceProjectPayload),
    );

    // Update meta (keep title if present)
    const currentMeta = listWorkspaceProjects().find((m) => m.id === id);
    upsertWorkspaceProjectMeta({
        id,
        title: currentMeta?.title || DEFAULT_TITLE,
        updatedAt: now(),
        kind: currentMeta?.kind || 'project',
    });
}

export function createWorkspaceProject(opts?: { title?: string; kind?: 'draft' | 'project' }): WorkspaceProjectMeta {
    const id = uuid();
    const meta: WorkspaceProjectMeta = {
        id,
        title: String(opts?.title || DEFAULT_TITLE),
        updatedAt: now(),
        kind: opts?.kind === 'draft' ? 'draft' : 'project',
    };
    upsertWorkspaceProjectMeta(meta);
    saveWorkspaceProject(id, { doc: '', messages: [], uiState: {} });
    setCurrentWorkspaceProjectId(id);
    return meta;
}

export function renameWorkspaceProject(id: string, title: string): void {
    const meta = listWorkspaceProjects().find((m) => m.id === id);
    if (!meta) return;
    upsertWorkspaceProjectMeta({ ...meta, title: String(title || DEFAULT_TITLE), updatedAt: now() });
}

export function deleteWorkspaceProject(id: string): void {
    // remove payload
    safeRemove(keyProject(id));

    // update index
    const all = listWorkspaceProjects().filter((m) => m.id !== id);
    safeSet(KEY_INDEX, JSON.stringify(all));

    // clear current id if needed
    const cur = getCurrentWorkspaceProjectId();
    if (cur === id) setCurrentWorkspaceProjectId(null);
}

/**
 * Migrate legacy autosave keys into a project if they exist.
 *
 * Important:
 * - Does NOT create a project when no legacy data exists.
 * - If a current project is already selected or projects already exist, this is a no-op.
 */
export function migrateLegacyWorkspaceIfPresent(): WorkspaceProjectMeta | null {
    const currentId = getCurrentWorkspaceProjectId();
    const existing = listWorkspaceProjects();
    if (currentId || existing.length > 0) return null;

    // Try migration from legacy keys.
    const legacyDoc = String(safeGet(LEGACY_DOC) || '');
    const legacyMessagesRaw = safeGet(LEGACY_MESSAGES);
    const legacyMessagesParsed = safeJsonParse<any>(legacyMessagesRaw);
    const legacyMessages = clampMessages(legacyMessagesParsed as any);
    const hasLegacy = legacyDoc.trim().length > 0 || legacyMessages.length > 0;
    if (hasLegacy) {
        const meta = createWorkspaceProject({ title: DEFAULT_TITLE, kind: 'project' });
        saveWorkspaceProject(meta.id, { doc: legacyDoc, messages: legacyMessages, uiState: {} });
        // Keep legacy keys for now (non-destructive), but we won't use them anymore.
        setCurrentWorkspaceProjectId(meta.id);
        return meta;
    }

    return null;
}

// NOTE: We intentionally removed the previous “ensureWorkspaceProjectInitialized” helper
// because it would create an Untitled project on first app open.
