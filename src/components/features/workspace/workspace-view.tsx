/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useAppStore } from '@/state/app-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChatMessage from '@/components/chat/chat-message';
import type { Message } from '@/components/chat/interactive-chat';
import { SelectionToolbar } from '@/components/selection-toolbar';
import { useSendWorkspaceThreadMessage } from '@/components/workspace/useSendWorkspaceThreadMessage';
import { cn } from '@/lib/utils';
import {
  Download,
  MessageCircle,
  FileUp,
  HelpCircle,
  X,
  Square,
  Send,
  Eye,
  Pencil,
  Maximize2,
  Minimize2,
  CheckSquare,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LogoSmall } from '@/components/logo-small';
import { WorkspacePreview } from '@/components/features/workspace/workspace-preview';
import { WorkspaceNextStepsCallout } from '@/components/features/workspace/workspace-next-steps-callout';
import { WorkspaceReviewPanel } from '@/components/features/workspace/workspace-review-panel';
import { ArtifactsPanel } from '@/components/explore/artifacts-panel';
import { useExtractWorkspaceInsights } from '@/components/workspace/useExtractWorkspaceInsights';
import { contextBeforeSelection, stripLatexPreambleAndMacros } from '@/lib/latex-context';
import { parseArxivId } from '@/lib/arxiv';
import { pickWaitingMessage } from '@/components/chat/waitingMessages';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import {
  deleteWorkspaceProject,
  getCurrentWorkspaceProjectId,
  listWorkspaceProjects,
  loadWorkspaceProject,
  renameWorkspaceProject,
  saveWorkspaceProject,
  setCurrentWorkspaceProjectId,
  type WorkspaceProjectMeta,
} from '@/lib/persistence/workspace-projects';
import { extractKatexMacrosFromLatexDocument } from '@/lib/latex/extract-katex-macros';
import { AskPaperModal } from '@/components/workspace/ask-paper-modal';

import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { Decoration, EditorView, WidgetType, keymap, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';

const DEFAULT_TITLE = 'Untitled';

function CurlyBracesIcon() {
  return (
    <span
      aria-hidden
      className="font-mono text-[14px] leading-none text-muted-foreground group-hover:text-foreground"
    >
      {'{}'}
    </span>
  );
}

type Anchor = { top: number; left: number };

type PendingArxivImport = {
  urlOrId: string;
  arxivId: string;
  insertPos: number;
};

function ArxivImportWidget(opts: { urlOrId: string; from: number; to: number }) {
  // This is only used in the CM widget DOM; keep it tiny.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Import LaTeX from arXiv';
  btn.setAttribute('aria-label', 'Import LaTeX from arXiv');
  btn.className =
    'ml-1 inline-flex items-center justify-center rounded border border-muted/40 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/20';
  btn.textContent = '💡';
  btn.addEventListener('mousedown', (e) => {
    // prevent editor focus / selection changes
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      window.dispatchEvent(
        new CustomEvent('adjoint:arxivImport', {
          detail: { urlOrId: opts.urlOrId, from: opts.from, to: opts.to },
        }),
      );
    } catch {
      // ignore
    }
  });
  return btn;
}

function buildArxivImportPlugin() {
  class BulbWidget extends WidgetType {
    constructor(
      private urlOrId: string,
      private from: number,
      private to: number,
    ) {
      super();
    }
    toDOM() {
      return ArxivImportWidget({ urlOrId: this.urlOrId, from: this.from, to: this.to });
    }
    ignoreEvent() {
      return true;
    }
  }

  const ARXIV_URL_RE = /https?:\/\/arxiv\.org\/(?:abs|pdf)\/[\w.\/-]+/gi;

  return ViewPlugin.fromClass(
    class {
      decorations: any;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();

        for (const { from, to } of view.visibleRanges) {
          const text = view.state.doc.sliceString(from, to);
          for (const m of text.matchAll(ARXIV_URL_RE)) {
            const raw = String(m[0] ?? '').trim();
            const idx = m.index ?? -1;
            if (!raw || idx < 0) continue;
            const parsed = parseArxivId(raw);
            if (!parsed) continue;

            const absFrom = from + idx;
            const absTo = absFrom + raw.length;

            // Place widget at end of URL.
            const deco = Decoration.widget({
              widget: new BulbWidget(raw, absFrom, absTo),
              side: 1,
            });
            builder.add(absTo, absTo, deco);
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

function splitSelectionIntoStatementAndProof(selectionLatex: string): {
  statement: string;
  proof: string | null;
} {
  const s = String(selectionLatex ?? '').trim();
  if (!s) return { statement: '', proof: null };

  // Heuristic 1: explicit proof environment inside selection.
  // If present, split at first \begin{proof}.
  const proofBegin = s.search(/\\begin\{proof\*?\}/);
  if (proofBegin >= 0) {
    const statement = s.slice(0, proofBegin).trim();
    const proof = s.slice(proofBegin).trim();
    return { statement, proof: proof || null };
  }

  // Heuristic 2: split on a line starting with "Proof" (common in drafts).
  const lines = s.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*(Proof\b|\*?Proof\b)[:.]?\s*$/i.test(l.trim()));
  if (idx >= 0) {
    const statement = lines.slice(0, idx).join('\n').trim();
    const proof = lines
      .slice(idx + 1)
      .join('\n')
      .trim();
    return { statement, proof: proof || null };
  }

  // Otherwise treat everything as a statement.
  return { statement: s, proof: null };
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function WorkspaceView() {
  const { toast } = useToast();
  const router = useRouter();
  const doc = useAppStore((s) => s.workspaceDoc);
  const setDoc = useAppStore((s) => s.setWorkspaceDoc);

  const messages = useAppStore((s) => s.workspaceMessages);
  const setMessages = useAppStore((s) => s.setWorkspaceMessages);

  const workspaceArtifacts = useAppStore((s) => (s as any).workspaceArtifacts);
  const workspaceArtifactEdits = useAppStore((s) => (s as any).workspaceArtifactEdits);
  const setWorkspaceArtifactEdit = useAppStore((s) => (s as any).setWorkspaceArtifactEdit);
  const workspaceInsightsIsExtracting = useAppStore(
    (s) => (s as any).workspaceInsightsIsExtracting,
  );
  const extractInsights = useExtractWorkspaceInsights();

  const isChatOpen = useAppStore((s) => s.isWorkspaceChatOpen);
  const setIsChatOpen = useAppStore((s) => s.setIsWorkspaceChatOpen);

  const rightTab = useAppStore((s) => s.workspaceRightPanelTab);
  const setRightTab = useAppStore((s) => s.setWorkspaceRightPanelTab);

  const rightWidth = useAppStore((s) => s.workspaceRightPanelWidth);
  const setRightWidth = useAppStore((s) => s.setWorkspaceRightPanelWidth);

  const draft = useAppStore((s) => s.workspaceDraft);
  const draftNonce = useAppStore((s) => s.workspaceDraftNonce);
  const setDraft = useAppStore((s) => s.setWorkspaceDraft);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cmRef = useRef<ReactCodeMirrorRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Workspace project state (persisted in localStorage)
  const [projectMeta, setProjectMeta] = useState<WorkspaceProjectMeta | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Ask-about-paper modal
  const [askPaperOpen, setAskPaperOpen] = useState(false);

  // arXiv import UI state
  const [pendingArxiv, setPendingArxiv] = useState<PendingArxivImport | null>(null);
  const [arxivDialogOpen, setArxivDialogOpen] = useState(false);
  const [arxivIsImporting, setArxivIsImporting] = useState(false);

  const deleteTitle = (projectMeta?.title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;

  const openArxivConfirm = (opts: { urlOrId: string; insertPos: number }) => {
    const parsed = parseArxivId(opts.urlOrId);
    if (!parsed) return;
    setPendingArxiv({ urlOrId: opts.urlOrId, arxivId: parsed.canonical, insertPos: opts.insertPos });
    setArxivDialogOpen(true);
  };

  const importArxivNow = async () => {
    if (!pendingArxiv) return;
    const view = cmRef.current?.view;
    if (!view) return;

    setArxivIsImporting(true);
    try {
      const resp = await fetch('/api/arxiv/import-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrId: pendingArxiv.urlOrId }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || `Import failed (HTTP ${resp.status})`);
      }

      const mainTex = String(data.mainTex ?? '').trim();
      const mainFile = String(data.mainFile ?? '').trim() || 'main.tex';

      if (!mainTex) throw new Error('Main TeX file was empty.');

      const id = pendingArxiv.arxivId;
      const block =
        `\n\n% --- Imported from arXiv: ${id} (file: ${mainFile}) ---\n` +
        `${mainTex}\n` +
        `% --- End arXiv import ---\n`;

      view.dispatch({
        changes: { from: pendingArxiv.insertPos, to: pendingArxiv.insertPos, insert: block },
        selection: { anchor: pendingArxiv.insertPos + block.length },
      });
      view.focus();

      toast({ title: 'Imported from arXiv', description: `Inserted LaTeX for ${id}.` });
      setArxivDialogOpen(false);

    } catch (e: any) {
      toast({
        title: 'arXiv import failed',
        description: e?.message || 'Could not import LaTeX from arXiv.',
        variant: 'destructive',
      });
      setArxivDialogOpen(false);
    } finally {
      setArxivIsImporting(false);
    }
  };

  // Listen to CodeMirror widget clicks.
  useEffect(() => {
    const onEvt = (evt: any) => {
      const urlOrId = String(evt?.detail?.urlOrId ?? '').trim();
      const to = Number(evt?.detail?.to ?? NaN);
      if (!urlOrId || !Number.isFinite(to)) return;

      // Insert below the URL: at end-of-line after the URL.
      const view = cmRef.current?.view;
      if (!view) return;
      const line = view.state.doc.lineAt(to);
      const insertPos = line.to;
      openArxivConfirm({ urlOrId, insertPos });
    };

    window.addEventListener('adjoint:arxivImport', onEvt as any);
    return () => window.removeEventListener('adjoint:arxivImport', onEvt as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Focus" state for expanding the chat panel into an overlay (match Prove mode UX).
  const [isChatFocused, setIsChatFocused] = useState(false);

  // Review is a full-screen workspace mode (not shown in the right sidebar).
  const isReviewMode = rightTab === 'review';
  const lastNonReviewTabRef = useRef<'chat' | 'insights' | 'preview'>('chat');

  // When entering review mode, ensure the right sidebar is closed.
  useEffect(() => {
    if (!isReviewMode) return;
    setIsChatOpen(false);
    setIsChatFocused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReviewMode]);

  // Hover hint coming from the “Getting started in Workspace” callout.
  // Kept as local UI state (no global store changes).
  const [hoverHint, setHoverHint] = useState<
    'import' | 'chat' | 'preview' | 'review' | 'export' | null
  >(null);

  useEffect(() => {
    const onHover = (evt: any) => {
      const id = (evt?.detail?.id ?? null) as any;
      setHoverHint(id || null);
    };
    try {
      window.addEventListener('adjoint:workspaceSidebarHover', onHover as any);
      return () => window.removeEventListener('adjoint:workspaceSidebarHover', onHover as any);
    } catch {
      return;
    }
  }, []);

  // UX: when a user first arrives in Workspace for the current browser session,
  // keep the right panel closed so they see the editor first.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = 'adjoint.workspace.firstEntryClosePanel.v1';
    try {
      const seen = window.sessionStorage.getItem(key) === '1';
      if (!seen) {
        setIsChatOpen(false);
        setIsChatFocused(false);
        window.sessionStorage.setItem(key, '1');
      }
    } catch {
      // Best-effort: if sessionStorage is unavailable, still prefer closed.
      setIsChatOpen(false);
      setIsChatFocused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag/drop state for inserting chat messages into the editor.
  const [isEditorDragOver, setIsEditorDragOver] = useState(false);

  // Escape closes focused chat overlay.
  useEffect(() => {
    if (!isChatFocused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsChatFocused(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isChatFocused]);

  // Drag-to-resize state (right panel width)
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartXRef.current;
      // Dragging handle left decreases width; right increases.
      const next = dragStartWidthRef.current - dx;
      setRightWidth(next);
    };
    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      try {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      } catch {
        // ignore
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setRightWidth]);

  // Selection state for floating toolbar.
  const [selection, setSelection] = useState<{
    text: string;
    anchor: Anchor | null;
    start: number;
    end: number;
  }>({ text: '', anchor: null, start: 0, end: 0 });

  const clearSelection = () => setSelection({ text: '', anchor: null, start: 0, end: 0 });

  // "Prove this" modal state
  const [isProveOpen, setIsProveOpen] = useState(false);
  const [proveIncludeContext, setProveIncludeContext] = useState(true);
  const [proveStripMacros, setProveStripMacros] = useState(true);
  const [proveStatement, setProveStatement] = useState('');
  const [proveContextPreview, setProveContextPreview] = useState('');
  const [provePayload, setProvePayload] = useState('');

  // Hydrate from project storage once.
  // NOTE: we intentionally do NOT auto-create a project on first app open.
  // We create a project when user clicks “Create Workspace” (Home modal) or
  // when navigating to Workspace with /workspace?new=1.
  useEffect(() => {
    try {
      const curId = getCurrentWorkspaceProjectId();
      if (!curId) return;
      const payload = loadWorkspaceProject(curId);
      if (!payload) return;

      const meta = listWorkspaceProjects().find((m) => m.id === curId) || null;
      if (meta) {
        setProjectMeta(meta);
        setTitleDraft(meta.title || DEFAULT_TITLE);
      }

      if ((doc ?? '').trim().length === 0 && payload.doc.trim().length > 0) {
        setDoc(payload.doc);
      }
      if ((messages ?? []).length === 0 && (payload.messages ?? []).length > 0) {
        setMessages(payload.messages as any);
      }

      // Restore UI state best-effort.
      const ui = payload.uiState || {};
      if (typeof ui.rightPanelTab === 'string') setRightTab(ui.rightPanelTab as any);
      if (typeof ui.rightPanelWidth === 'number') setRightWidth(ui.rightPanelWidth);
      if (typeof ui.isChatOpen === 'boolean') setIsChatOpen(ui.isChatOpen);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave to the active project (debounced).
  useEffect(() => {
    try {
      const t = window.setTimeout(() => {
        try {
          const id = getCurrentWorkspaceProjectId() || projectMeta?.id;
          if (!id) return;

          saveWorkspaceProject(id, {
            doc: doc ?? '',
            messages: (messages ?? []) as any,
            uiState: {
              isChatOpen: Boolean(useAppStore.getState().isWorkspaceChatOpen),
              rightPanelTab: useAppStore.getState().workspaceRightPanelTab,
              rightPanelWidth: useAppStore.getState().workspaceRightPanelWidth,
            },
          });
        } catch {
          // ignore
        }
      }, 600);
      return () => window.clearTimeout(t);
    } catch {
      return;
    }
  }, [doc, messages, projectMeta?.id]);

  const syncMetaFromStorage = () => {
    try {
      const curId = getCurrentWorkspaceProjectId();
      if (!curId) return;
      const meta = listWorkspaceProjects().find((m) => m.id === curId) || null;
      if (meta) {
        setProjectMeta(meta);
        if (!isEditingTitle) setTitleDraft(meta.title || DEFAULT_TITLE);
      }
    } catch {
      // ignore
    }
  };

  const openProjectById = (id: string) => {
    const trimmed = String(id || '').trim();
    if (!trimmed) return;
    try {
      setCurrentWorkspaceProjectId(trimmed);
      const meta = listWorkspaceProjects().find((m) => m.id === trimmed) || null;
      if (meta) {
        setProjectMeta(meta);
        setTitleDraft(meta.title || DEFAULT_TITLE);
      }

      const payload = loadWorkspaceProject(trimmed);
      setDoc(payload?.doc ?? '');
      setMessages((payload?.messages ?? []) as any);

      const ui = payload?.uiState || {};
      if (typeof ui.rightPanelTab === 'string') setRightTab(ui.rightPanelTab as any);
      if (typeof ui.rightPanelWidth === 'number') setRightWidth(ui.rightPanelWidth);
      if (typeof ui.isChatOpen === 'boolean') setIsChatOpen(ui.isChatOpen);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    // If user deep-links to /workspace with no selected project, redirect to home.
    // (Home modal will offer “Create Workspace”.)
    const curId = getCurrentWorkspaceProjectId();
    if (!curId) {
      router.push('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitTitleEdit = () => {
    const id = getCurrentWorkspaceProjectId() || projectMeta?.id;
    if (!id) return;
    const next = String(titleDraft || '').trim() || DEFAULT_TITLE;
    try {
      renameWorkspaceProject(id, next);
      setIsEditingTitle(false);
      syncMetaFromStorage();
      toast({ title: 'Renamed', description: `Project renamed to “${next}”.` });
    } catch {
      // ignore
      setIsEditingTitle(false);
    }
  };

  const onDeleteCurrentProject = () => {
    const id = getCurrentWorkspaceProjectId() || projectMeta?.id;
    if (!id) return;
    try {
      deleteWorkspaceProject(id);
      setConfirmDeleteOpen(false);

      toast({ title: 'Deleted', description: 'Workspace deleted.' });
      router.push('/');
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: e?.message || 'Could not delete the project.',
        variant: 'destructive',
      });
    }
  };

  const updateSelectionFromCodeMirror = () => {
    const view = cmRef.current?.view;
    if (!view) return;

    const sel = view.state.selection.main;
    const start = sel.from;
    const end = sel.to;

    if (start === end) {
      clearSelection();
      return;
    }

    const text = view.state.sliceDoc(start, end).trim();
    if (!text) {
      clearSelection();
      return;
    }

    const a = view.coordsAtPos(start);
    const b = view.coordsAtPos(end);
    const rect = view.dom.getBoundingClientRect();
    const cx = ((a?.left ?? rect.left) + (b?.right ?? rect.right)) / 2;
    const top = Math.min(a?.top ?? rect.top, b?.top ?? rect.top);
    const anchor = { top, left: cx };

    setSelection({ text, anchor, start, end });
  };

  const onMouseUp = () => {
    // Legacy textarea fallback (should not run once CodeMirror is mounted)
    const ta = textareaRef.current;
    if (ta && !cmRef.current?.view) {
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      if (start === end) {
        clearSelection();
        return;
      }
      const text = (ta.value || '').slice(start, end).trim();
      if (!text) {
        clearSelection();
        return;
      }
      const rect = ta.getBoundingClientRect();
      const anchor = { top: rect.top + 8, left: rect.left + rect.width / 2 };
      setSelection({ text, anchor, start, end });
      return;
    }

    updateSelectionFromCodeMirror();
  };

  const selectionContext = useMemo(() => {
    if (!selection.text || selection.start === selection.end) return null;
    const windowChars = 1200;
    const left = Math.max(0, selection.start - windowChars);
    const right = Math.min((doc || '').length, selection.end + windowChars);
    return {
      selectionText: selection.text,
      contextText: (doc || '').slice(left, right),
    };
  }, [selection, doc]);

  const openProveModalFromSelection = () => {
    const selected = (selection.text || '').trim();
    if (!selected) return;

    const body = proveStripMacros ? stripLatexPreambleAndMacros(selected) : selected;
    const ctx = contextBeforeSelection({
      doc: doc || '',
      selectionStart: selection.start,
      maxChars: 6000,
      stripMacros: proveStripMacros,
    });

    setProveStatement(body);
    setProveContextPreview(ctx);

    // Compute initial payload.
    const statement = body.trim();
    const context = ctx.trim();
    const payload = !statement
      ? ''
      : !proveIncludeContext || !context
        ? statement
        : `${context}${statement}`;
    setProvePayload(payload);
    setIsProveOpen(true);
  };

  const buildProverPayload = () => {
    const statement = (proveStatement || '').trim();
    const ctx = (proveContextPreview || '').trim();

    if (!statement) return '';
    if (!proveIncludeContext || !ctx) return statement;

    // Keep context above the statement.
    // We intentionally do not include \documentclass etc.
    return `${ctx}${statement}`;
  };

  // Keep the inferred payload in sync with toggles.
  useEffect(() => {
    if (!isProveOpen) return;
    setProvePayload(buildProverPayload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProveOpen, proveIncludeContext, proveStripMacros, proveStatement, proveContextPreview]);

  const cmExtensions = useMemo<Extension[]>(() => {
    const latex = StreamLanguage.define(stex);
    const fullHeight = EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': { overflow: 'auto' },
      // Ensure the last line can scroll above the bottom border.
      '.cm-content': { minHeight: '100%', paddingBottom: '6rem' },
    });
    return [
      latex,
      EditorView.lineWrapping,
      fullHeight,
      bracketMatching(),
      closeBrackets(),
      keymap.of(closeBracketsKeymap),
      buildArxivImportPlugin(),
      // Keep selection events in sync with the floating toolbar.
      EditorView.updateListener.of((v) => {
        if (v.selectionSet) updateSelectionFromCodeMirror();
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToBottom = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    const viewport = el.querySelector(
      'div[data-radix-scroll-area-viewport]',
    ) as HTMLDivElement | null;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Prefill chat input when asked (via selection toolbar)
  const [chatInput, setChatInput] = useState('');
  useEffect(() => {
    if (!draftNonce) return;
    const next = String(draft ?? '');
    setChatInput(next);
    try {
      requestAnimationFrame(() => {
        chatInputRef.current?.focus();
        const len = next.length;
        chatInputRef.current?.setSelectionRange(len, len);
      });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNonce]);

  const send = useSendWorkspaceThreadMessage();
  const [, startSending] = useTransition();
  const cancelWorkspaceChatCurrent = useAppStore((s) => s.cancelWorkspaceChatCurrent);
  const setWorkspaceChatCancelCurrent = useAppStore((s) => s.setWorkspaceChatCancelCurrent);

  const handleSend = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    // If a stream is in-flight, don't start another one.
    if (cancelWorkspaceChatCurrent) return;

    // Cancel any in-flight workspace chat stream before starting a new one.
    try {
      useAppStore.getState().cancelWorkspaceChatCurrent?.();
    } catch {
      // ignore
    }

    const controller = new AbortController();
    setWorkspaceChatCancelCurrent(() => {
      try {
        if (!controller.signal.aborted) controller.abort();
      } catch {
        // ignore
      }
    });

    const userMsg: Message = { role: 'user', content: trimmed };
    const typing: Message = {
      role: 'assistant',
      content: '',
      isTyping: true,
      waitingMessage: pickWaitingMessage(),
    };

    const history = [...messages, userMsg]
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    const selectionText = selectionContext?.selectionText;
    const contextText = selectionContext?.contextText ?? (doc || '').slice(0, 2000);

    // Send a cleaner LaTeX context to the model (strip preamble/macros), similar to the prover pipeline.
    // This reduces token waste and avoids flooding the model with \newcommand definitions.
    const cleanedSelectionText = selectionText
      ? stripLatexPreambleAndMacros(selectionText)
      : undefined;
    const cleanedContextText = stripLatexPreambleAndMacros(contextText);

    setMessages((prev) => [...prev, userMsg, typing]);

    startSending(async () => {
      await send(
        {
          request: trimmed,
          selectionText: cleanedSelectionText,
          contextText: cleanedContextText,
          history,
        },
        {
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((m, idx) =>
                idx === prev.length - 1
                  ? ({
                    ...m,
                    role: 'assistant',
                    isTyping: true,
                    content: String(m.content || '') + delta,
                  } as any)
                  : m,
              ),
            );
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((m, idx) =>
                idx === prev.length - 1 ? ({ ...m, isTyping: false } as any) : m,
              ),
            );

            // Clear cancel handle (stream ended / aborted).
            try {
              setWorkspaceChatCancelCurrent(null);
            } catch {
              // ignore
            }

            // Auto-extract insights after the assistant finishes.
            try {
              const latest = useAppStore.getState().workspaceMessages;
              const lastUser = [...latest].reverse().find((m: any) => m.role === 'user')?.content;
              const basis = String(lastUser ?? trimmed);
              void extractInsights({
                request: basis,
                history: latest.slice(-10) as any,
                seed: (doc || '').slice(0, 2000),
              });
            } catch {
              // ignore
            }
          },
          onError: (msg) => {
            setMessages((prev) =>
              prev.map((m, idx) =>
                idx === prev.length - 1
                  ? ({ ...m, isTyping: false, content: msg || 'Error.' } as any)
                  : m,
              ),
            );

            try {
              setWorkspaceChatCancelCurrent(null);
            } catch {
              // ignore
            }
          },
        },
        { abortSignal: controller.signal },
      );
    });

    setChatInput('');
    setDraft('', { open: true });
    clearSelection();
  };

  const onImport = async (file: File) => {
    const contents = await file.text();
    const imported = String(contents ?? '').trim();
    if (!imported) return;

    const view = cmRef.current?.view;

    const computeInsertion = (docText: string, pos: number, chunk: string) => {
      // Insert with some spacing so imported files don't smash into surrounding text.
      const before = docText.slice(0, pos);
      const after = docText.slice(pos);
      const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
      const needsExtraLeadingBlank = before.length > 0 && !before.endsWith('\n\n');
      const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');

      const lead = before.length === 0 ? '' : needsLeadingNewline ? '\n\n' : needsExtraLeadingBlank ? '\n' : '';
      const tail = needsTrailingNewline ? '\n\n' : after.length > 0 ? '' : '\n';
      return `${lead}${chunk}${tail}`;
    };

    if (view) {
      // Insert at cursor (or selection end) without overwriting selection.
      const sel = view.state.selection.main;
      const pos = sel.to;
      const docText = view.state.doc.toString();
      const insert = computeInsertion(docText, pos, imported);

      view.dispatch({
        changes: { from: pos, to: pos, insert },
        selection: { anchor: pos + insert.length },
      });
      view.focus();
      return;
    }

    // Fallback (legacy textarea): append at end.
    const prev = String(useAppStore.getState().workspaceDoc ?? '');
    const next = prev.trimEnd().length === 0 ? imported : `${prev.trimEnd()}\n\n${imported}\n`;
    setDoc(next);
  };

  const onExport = () => {
    downloadTextFile('document.tex', doc ?? '');
  };

  // Small guard: if the right panel is open but its current tab isn't visible on the left rail
  // (e.g. older state), close it.
  useEffect(() => {
    if (!isChatOpen) return;
    if (
      rightTab !== 'chat' &&
      rightTab !== 'insights' &&
      rightTab !== 'preview' &&
      rightTab !== 'review'
    ) {
      setIsChatOpen(false);
    }
  }, [isChatOpen, rightTab, setIsChatOpen]);

  // Allow deleting a candidate statement from Workspace Insights.
  useEffect(() => {
    const onDelete = (evt: any) => {
      const s = String(evt?.detail?.statement ?? '').trim();
      if (!s) return;
      try {
        useAppStore.getState().deleteWorkspaceCandidateStatement(s);
      } catch {
        // ignore
      }
    };
    window.addEventListener('artifacts:delete-candidate-statement', onDelete as any);
    return () =>
      window.removeEventListener('artifacts:delete-candidate-statement', onDelete as any);
  }, []);

  const ChatPanel = (
    <div className="relative h-full rounded-lg border bg-background overflow-hidden flex flex-col">
      {/* Header bar (keeps controls aligned + avoids overlaying messages) */}
      <div className="h-11 px-3 border-b flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">
          {rightTab === 'insights'
            ? 'Candidate extraction'
            : rightTab === 'preview'
              ? 'Preview'
              : 'Chat'}
        </div>

        <div className="flex items-center gap-1">
          {rightTab !== 'preview' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                // Toggle: Insights <-> Chat
                setRightTab(
                  useAppStore.getState().workspaceRightPanelTab === 'insights'
                    ? 'chat'
                    : 'insights',
                );
                setIsChatOpen(true);
              }}
              aria-label="Candidate extraction"
              title="Candidate extraction"
              className={cn(
                'h-8 w-8 group',
                rightTab === 'insights'
                  ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
                  : '',
              )}
            >
              <CurlyBracesIcon />
            </Button>
          )}

          {rightTab === 'chat' &&
            (isChatFocused ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsChatFocused(false)}
                aria-label="Reduce to panel"
                title="Reduce"
                className="h-8 w-8"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsChatFocused(true)}
                aria-label="Expand chat"
                title="Expand"
                className="h-8 w-8"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            ))}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsChatOpen(false);
              setIsChatFocused(false);
            }}
            aria-label="Close chat"
            title="Close"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {rightTab === 'chat' ? (
        <>
          <ScrollArea className="flex-1 px-3 md:px-6" ref={chatScrollRef as any}>
            <div className="flex flex-col gap-4 py-6 min-w-0 pr-2">
              {(messages as Message[]).map((m, idx) => (
                <ChatMessage message={m as any} key={idx} />
              ))}
            </div>
          </ScrollArea>

          <div className="p-6 border-t bg-background">
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                if (!cancelWorkspaceChatCurrent) handleSend();
              }}
            >
              <Textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!cancelWorkspaceChatCurrent) handleSend();
                  }
                }}
                placeholder={
                  selectionContext ? 'Ask about the selected excerpt…' : 'Ask about this draft…'
                }
                rows={1}
                className="w-full rounded-lg pl-4 pr-40 py-3 text-base resize-none focus-visible:ring-primary"
              />

              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (cancelWorkspaceChatCurrent) {
                      try {
                        cancelWorkspaceChatCurrent?.();
                      } catch {
                        // ignore
                      }
                      return;
                    }
                    handleSend();
                  }}
                  aria-label={cancelWorkspaceChatCurrent ? 'Stop generating' : 'Send message'}
                >
                  {cancelWorkspaceChatCurrent ? (
                    <Square className="h-5 w-5" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </>
      ) : rightTab === 'insights' ? (
        <div className="flex-1 min-h-0 p-0">
          {/* Avoid extra nested borders; the panel already has a border container. */}
          <ArtifactsPanel
            artifacts={workspaceArtifacts}
            onPromote={(statement: string) => {
              const s = (statement || '').trim();
              if (!s) return;
              // Carry Workspace macros into Prover rendering.
              try {
                const macros = extractKatexMacrosFromLatexDocument(doc || '');
                useAppStore.setState({ proofRenderMacros: macros } as any);
              } catch {
                // ignore
              }
              router.push(`/prove?q=${encodeURIComponent(s)}`);
            }}
            isExtracting={Boolean(workspaceInsightsIsExtracting)}
            edits={workspaceArtifactEdits}
            setEdit={setWorkspaceArtifactEdit}
          />
        </div>
      ) : (
        <ScrollArea className="flex-1 px-3 md:px-6" scrollbar="both">
          <div className="py-6">
            <WorkspacePreview content={doc || ''} />
          </div>
        </ScrollArea>
      )}
    </div>
  );

  return (
    <div className="inset-0 absolute overflow-hidden flex">
      {/* Left sidebar (match Proof mode) */}
      <aside className="w-14 flex flex-col items-center py-4 border-r bg-card shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept=".tex,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            // Reset input value immediately so selecting the same file again retriggers onChange,
            // even if the user re-opens the picker quickly.
            try {
              if (fileInputRef.current) fileInputRef.current.value = '';
              // Also clear the event target for robustness.
              (e.target as HTMLInputElement).value = '';
            } catch {
              // ignore
            }

            await onImport(f);
          }}
        />

        <div className="mb-6 cursor-pointer" onClick={() => router.push('/')}>
          <LogoSmall />
        </div>

        <div className="flex flex-col items-center space-y-2">
          <Button
            data-workspace-action="import"
            variant="ghost"
            size="icon"
            title="Import"
            onClick={() => {
              // Ensure the next selection always fires onChange (even if same file).
              try {
                if (fileInputRef.current) fileInputRef.current.value = '';
              } catch {
                // ignore
              }
              fileInputRef.current?.click();
            }}
            className={hoverHint === 'import' ? 'ring-1 ring-primary/25' : undefined}
          >
            <FileUp />
            <span className="sr-only">Import</span>
          </Button>

          <Button
            data-workspace-action="chat"
            variant="ghost"
            size="icon"
            title="Chat"
            onClick={() => {
              if (isReviewMode) lastNonReviewTabRef.current = 'chat';
              setIsChatOpen((prev) => (prev && rightTab === 'chat' ? false : true));
              setRightTab('chat');
            }}
            className={cn(
              isChatOpen ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : '',
              hoverHint === 'chat' ? 'ring-1 ring-primary/25' : '',
            )}
          >
            <MessageCircle />
            <span className="sr-only">Chat</span>
          </Button>

          <Button
            data-workspace-action="preview"
            variant="ghost"
            size="icon"
            title="Preview"
            onClick={() => {
              if (isReviewMode) lastNonReviewTabRef.current = 'preview';
              setIsChatOpen((prev) => (prev && rightTab === 'preview' ? false : true));
              setRightTab('preview');
            }}
            className={cn(
              isChatOpen && rightTab === 'preview'
                ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
                : '',
              hoverHint === 'preview' ? 'ring-1 ring-primary/25' : '',
            )}
          >
            <Eye />
            <span className="sr-only">Preview</span>
          </Button>

          <Button
            data-workspace-action="review"
            variant="ghost"
            size="icon"
            title="Review"
            onClick={() => {
              if (rightTab === 'review') {
                setRightTab(lastNonReviewTabRef.current ?? 'chat');
                // remain in editor mode; keep side panel closed by default
                setIsChatOpen(false);
                setIsChatFocused(false);
                return;
              }

              // entering review mode: remember last non-review right panel tab
              if (rightTab === 'chat' || rightTab === 'insights' || rightTab === 'preview') {
                lastNonReviewTabRef.current = rightTab;
              }
              setRightTab('review');
              setIsChatOpen(false);
              setIsChatFocused(false);
            }}
            className={cn(
              isReviewMode
                ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
                : '',
              hoverHint === 'review' ? 'ring-1 ring-primary/25' : '',
            )}
          >
            <CheckSquare />
            <span className="sr-only">Review</span>
          </Button>

          <Button
            data-workspace-action="export"
            variant="ghost"
            size="icon"
            title="Export"
            onClick={onExport}
            className={hoverHint === 'export' ? 'ring-1 ring-primary/25' : undefined}
          >
            <Download />
            <span className="sr-only">Export</span>
          </Button>

          <Button
            data-workspace-action="ask-paper"
            variant="ghost"
            size="icon"
            title="Ask about a paper"
            onClick={() => setAskPaperOpen(true)}
          >
            <HelpCircle />
            <span className="sr-only">Ask about a paper</span>
          </Button>
        </div>
        <div className="flex-1" />
      </aside>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden p-3 flex flex-col">
          {/* Top-left project header */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              {isEditingTitle ? (
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => {
                    // Click outside cancels edit.
                    setIsEditingTitle(false);
                    setTitleDraft(projectMeta?.title || DEFAULT_TITLE);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitleEdit();
                    if (e.key === 'Escape') {
                      setIsEditingTitle(false);
                      setTitleDraft(projectMeta?.title || DEFAULT_TITLE);
                    }
                  }}
                  autoFocus
                  className="h-9 w-[280px] max-w-[60vw] rounded-md border bg-background px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40"
                />
              ) : (
                <button
                  type="button"
                  className="truncate text-sm font-medium text-foreground hover:underline"
                  title="Rename project"
                  onClick={() => {
                    setIsEditingTitle(true);
                    setTitleDraft(projectMeta?.title || DEFAULT_TITLE);
                  }}
                >
                  {projectMeta?.title || DEFAULT_TITLE}
                </button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDeleteOpen(true)}
                title="Delete project"
                aria-label="Delete project"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isReviewMode ? (
            <div className="flex-1 min-h-0 rounded-lg border bg-background overflow-hidden">
              <WorkspaceReviewPanel />
            </div>
          ) : (
            <>
              <div className="mb-3">
                <WorkspaceNextStepsCallout />
              </div>
              <div
                className={cn(
                  'flex-1 min-h-0 rounded-lg border bg-background overflow-hidden',
                  isEditorDragOver ? 'ring-2 ring-primary/40 border-primary/30' : '',
                )}
                data-local-selection="1"
                data-selection-enabled="1"
                onDragEnter={(e) => {
                  // Only react to text drags.
                  if (!e.dataTransfer?.types?.includes('text/plain')) return;
                  setIsEditorDragOver(true);
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer?.types?.includes('text/plain')) return;
                  // Required to allow drop.
                  e.preventDefault();
                  try {
                    e.dataTransfer.dropEffect = 'copy';
                  } catch {
                    // ignore
                  }
                }}
                onDragLeave={() => setIsEditorDragOver(false)}
                onDrop={(e) => {
                  setIsEditorDragOver(false);
                  const view = cmRef.current?.view;
                  if (!view) return;

                  e.preventDefault();
                  const text = String(e.dataTransfer?.getData('text/plain') ?? '');
                  if (!text) return;

                  // Prefer dropping at mouse location.
                  const pos =
                    view.posAtCoords({ x: e.clientX, y: e.clientY }) ??
                    view.state.selection.main.from;

                  view.dispatch({
                    changes: { from: pos, to: pos, insert: text },
                    selection: { anchor: pos + text.length },
                  });
                  view.focus();
                }}
              >
                <CodeMirror
                  ref={cmRef}
                  value={doc}
                  onChange={(val) => setDoc(val)}
                  onMouseUp={onMouseUp as any}
                  onKeyUp={onMouseUp as any}
                  placeholder="Type LaTeX here…"
                  extensions={cmExtensions}
                  theme="dark"
                  basicSetup={{
                    lineNumbers: false,
                    foldGutter: false,
                    highlightActiveLine: false,
                    highlightSelectionMatches: false,
                  }}
                  className="h-full [&_.cm-editor]:h-full"
                />
              </div>

              {selection.anchor && (
                <SelectionToolbar
                  anchor={selection.anchor}
                  selectedText={selection.text}
                  copyText={selection.text}
                  onRevise={() => { }}
                  canCheckAgain={false}
                  showCheckAgain={false}
                  showRevise={false}
                  showCopy={true}
                  showAskAI={true}
                  showProveThis={true}
                  showAddToReview={true}
                  // Put Verify before Ask AI (chat) in the selection toolbar.
                  buttonOrder={['copy', 'addToReview', 'importArxiv', 'verify', 'proveThis', 'askAI']}
                  onProveThis={() => openProveModalFromSelection()}
                  onAddToReview={({ selectionLatex }) => {
                    const view = cmRef.current?.view;
                    if (!view) return;

                    const sel = view.state.selection.main;
                    const from = sel.from;
                    const to = sel.to;
                    if (from === to) return;

                    const { statement, proof } =
                      splitSelectionIntoStatementAndProof(selectionLatex);
                    const env = 'claim';
                    const body = statement.trim();
                    const proofBody = (proof ?? '').trim();

                    const block = proofBody
                      ? `\\begin{${env}}\n${body}\n\\end{${env}}\n\n${proofBody}`
                      : `\\begin{${env}}\n${body}\n\\end{${env}}`;

                    view.dispatch({
                      changes: { from, to, insert: block },
                      selection: { anchor: from + block.length },
                    });
                    view.focus();

                    // Switch to Review mode so the user sees the newly created artifact.
                    try {
                      setRightTab('review');
                      setIsChatOpen(false);
                      setIsChatFocused(false);
                    } catch {
                      // ignore
                    }
                  }}
                  onAskAI={() => {
                    // Open chat and prefill with the selected excerpt.
                    setDraft(selection.text, { open: true });
                    setRightTab('chat');
                    setIsChatOpen(true);
                  }}
                  showImportArxiv={Boolean(parseArxivId(selection.text))}
                  onImportArxiv={() => {
                    const parsed = parseArxivId(selection.text);
                    if (!parsed) return;

                    const view = cmRef.current?.view;
                    if (!view) return;
                    const line = view.state.doc.lineAt(selection.end);
                    const insertPos = line.to;
                    openArxivConfirm({ urlOrId: selection.text, insertPos });
                  }}
                />
              )}

              <Dialog
                open={isProveOpen}
                onOpenChange={(open) => {
                  setIsProveOpen(open);
                }}
              >
                <DialogContent className="sm:max-w-[720px]">
                  <DialogHeader>
                    <DialogTitle>Attempt proof with AI?</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="prove-payload" className="flex items-center gap-2">
                          Inferred Statement
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Label>
                      </div>
                      <Textarea
                        id="prove-payload"
                        value={provePayload}
                        onChange={(e) => setProvePayload(e.target.value)}
                        rows={6}
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-3 rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="prove-include-context"
                          checked={proveIncludeContext}
                          onCheckedChange={(v) => setProveIncludeContext(Boolean(v))}
                        />
                        <Label htmlFor="prove-include-context">Add preceding context</Label>
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="prove-strip-macros"
                          checked={proveStripMacros}
                          onCheckedChange={(v) => {
                            const next = Boolean(v);
                            setProveStripMacros(next);
                            // Recompute previews with the new mode.
                            const selected = (selection.text || '').trim();
                            const body = next ? stripLatexPreambleAndMacros(selected) : selected;
                            const ctx = contextBeforeSelection({
                              doc: doc || '',
                              selectionStart: selection.start,
                              maxChars: 6000,
                              stripMacros: next,
                            });
                            setProveStatement(body);
                            setProveContextPreview(ctx);
                          }}
                        />
                        <Label htmlFor="prove-strip-macros">
                          Strip macros/preamble from context
                        </Label>
                      </div>

                      {/* Inferred payload is always editable. */}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsProveOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        const payload = (provePayload || '').trim();
                        if (!payload) return;
                        setIsProveOpen(false);
                        clearSelection();
                        // Carry Workspace macros into Prover rendering.
                        try {
                          const macros = extractKatexMacrosFromLatexDocument(doc || '');
                          useAppStore.setState({ proofRenderMacros: macros } as any);
                        } catch {
                          // ignore
                        }
                        // Switch to dedicated prover mode.
                        router.push(`/prove?q=${encodeURIComponent(payload)}`);
                      }}
                    >
                      Continue
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* arXiv import confirm dialog */}
              <Dialog
                open={arxivDialogOpen}
                onOpenChange={(open) => {
                  setArxivDialogOpen(open);
                  if (!open) {
                    setPendingArxiv(null);
                    setArxivIsImporting(false);
                  }
                }}
              >
                <DialogContent className="sm:max-w-[720px]">
                  <DialogHeader>
                    <DialogTitle>Import LaTeX from arXiv?</DialogTitle>
                  </DialogHeader>

                  {pendingArxiv ? (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        This will download the arXiv source bundle and insert the main <code>.tex</code> file
                        below the link.
                      </div>
                      <div className="rounded-md border bg-muted/20 p-2 text-sm font-mono">
                        arXiv: {pendingArxiv.arxivId}
                      </div>
                    </div>
                  ) : null}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setArxivDialogOpen(false)}>
                      Cancel
                    </Button>

                    <Button onClick={() => void importArxivNow()} disabled={arxivIsImporting || !pendingArxiv}>
                      {arxivIsImporting ? 'Importing…' : 'Import below link'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </main>

        {/* Draggable divider + Right panel */}
        <div
          className={cn('relative shrink-0 h-full', isChatOpen && !isReviewMode ? '' : 'w-0')}
          style={{ width: isChatOpen ? rightWidth : 0 }}
        >
          {/* Drag handle */}
          {isChatOpen && !isReviewMode && (
            <div
              className="absolute left-0 top-0 h-full w-2 -translate-x-1 cursor-col-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side panel"
              onMouseDown={(e) => {
                isDraggingRef.current = true;
                dragStartXRef.current = e.clientX;
                dragStartWidthRef.current = rightWidth;
                try {
                  document.body.style.cursor = 'col-resize';
                  document.body.style.userSelect = 'none';
                } catch {
                  // ignore
                }
              }}
            >
              {/* subtle visual line */}
              <div className="h-full w-px bg-border/60 ml-1" />
            </div>
          )}

          <aside
            className={cn(
              // Keep this as a true right sidebar (not full-screen)
              'h-full min-h-0 border-l bg-background overflow-hidden transition-all flex flex-col p-3',
              isChatOpen ? '' : 'w-0 p-0 border-l-0',
            )}
          >
            {isChatOpen && !isReviewMode && !isChatFocused && ChatPanel}
          </aside>
        </div>
      </div>

      {/* Focus overlay (chat only) */}
      {isChatOpen && !isReviewMode && isChatFocused && rightTab === 'chat' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          role="dialog"
          aria-modal={true}
          onClick={() => setIsChatFocused(false)}
        >
          <div
            className="w-full max-w-[85vw] h-[85vh] bg-background border rounded-lg shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {ChatPanel}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTitle}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeleteCurrentProject();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AskPaperModal
        open={askPaperOpen}
        onOpenChange={setAskPaperOpen}
        onAddToWorkspace={(latex) => {
          const view = cmRef.current?.view;
          const chunk = String(latex || '').trim();
          if (!chunk) return;

          const block = [
            '% --- Imported from paper excerpt ---',
            chunk,
            '% --- End paper import ---',
          ].join('\n');

          if (view) {
            const pos = view.state.selection.main.to;
            const insert = `\n\n${block}\n`;
            view.dispatch({
              changes: { from: pos, to: pos, insert },
              selection: { anchor: pos + insert.length },
            });
            view.focus();
            return;
          }

          // Fallback
          const prev = String(useAppStore.getState().workspaceDoc ?? '');
          const next = prev.trimEnd().length === 0 ? block : `${prev.trimEnd()}\n\n${block}\n`;
          setDoc(next);
        }}
        onAskInChat={({ latex, question }) => {
          const view = cmRef.current?.view;
          const chunk = String(latex || '').trim();
          const q = String(question || '').trim();
          if (!chunk) return;

          const block = [
            '% --- Imported from paper excerpt ---',
            chunk,
            '% --- End paper import ---',
          ].join('\n');

          if (view) {
            const pos = view.state.selection.main.to;
            const insert = `\n\n${block}\n`;
            view.dispatch({
              changes: { from: pos, to: pos, insert },
              selection: { anchor: pos + insert.length },
            });
            view.focus();
          }

          if (q) {
            setDraft(q, { open: true });
            setRightTab('chat');
            setIsChatOpen(true);
          }
        }}
      />
    </div>
  );
}
