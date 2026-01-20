'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/state/app-store';
import { extractLatexArtifacts } from '@/lib/latex/extract-artifacts';
import type { ExtractedArtifact } from '@/types/review';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, ChevronRight, Loader2, Pencil, Undo2 } from 'lucide-react';
import { reviewArtifactSoundnessAction } from '@/app/actions';
import AdjointProse from '@/components/adjoint-prose';
import { KatexRenderer } from '@/components/katex-renderer';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { extractKatexMacrosFromLatexDocument } from '@/lib/latex/extract-katex-macros';

function artifactKey(a: ExtractedArtifact): string {
    const label = (a.label ?? '').trim();
    return label ? label : `${a.type}@${a.artifactStartChar}`;
}

function stripFirstLabelFromBody(body: string): { body: string; label: string | null } {
    const s = String(body ?? '');
    const m = s.match(/\\label\s*\{([^}]+)\}/);
    if (!m || m.index == null) return { body: s, label: null };
    const before = s.slice(0, m.index);
    const after = s.slice(m.index + m[0].length);
    // Remove the label token plus one adjacent newline if present.
    const cleaned = `${before}${after}`
        .replace(/^\s*\n/, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n');
    return { body: cleaned.trim(), label: m[1] ?? null };
}

function ensureLabelInBody(body: string, label: string | null): string {
    const b = String(body ?? '').trim();
    if (!label) return b;
    if (/\\label\s*\{[^}]+\}/.test(b)) return b;
    // Insert at top, matching common LaTeX style for theorem envs.
    return `\\label{${label}}\n${b}`.trim();
}

function buildPaperContextBefore(fullDoc: string, artifactStartChar: number, maxChars = 40_000): string {
    const doc = String(fullDoc ?? '');
    const end = Math.max(0, Math.min(doc.length, artifactStartChar || 0));
    let before = doc.slice(0, end);

    // Strip preamble (everything before \begin{document}) to reduce token waste.
    // Keep original offsets elsewhere; this only affects what we SEND to the model.
    const beginDocIdx = before.indexOf('\\begin{document}');
    if (beginDocIdx >= 0) {
        before = before.slice(beginDocIdx + '\\begin{document}'.length);
    }
    if (before.length <= maxChars) return before;

    // Keep head + tail to preserve global definitions/macros and local context.
    const headLen = Math.min(10_000, Math.floor(maxChars * 0.4));
    const tailLen = Math.max(0, maxChars - headLen - 200);
    const head = before.slice(0, headLen);
    const tail = before.slice(Math.max(0, before.length - tailLen));
    const omitted = before.length - head.length - tail.length;
    return `${head}\n\n% --- CONTEXT TRUNCATED (${omitted} chars omitted) ---\n\n${tail}`;
}

function ReviewVerdictBadge({ v }: { v: 'OK' | 'ISSUE' | 'UNCLEAR' }) {
    return (
        <Badge
            variant={
                v === 'OK'
                    ? 'secondary'
                    : v === 'ISSUE'
                        ? 'destructive'
                        : 'outline'
            }
        >
            {v}
        </Badge>
    );
}

function cleanFeedback(s: unknown): string {
    return String(s ?? '').trim();
}

export function WorkspaceReviewPanel() {
    const { toast } = useToast();
    const doc = useAppStore((s) => s.workspaceDoc);

    const macros = useMemo(() => extractKatexMacrosFromLatexDocument(doc || ''), [doc]);

    const artifacts = useAppStore((s) => s.workspaceReviewArtifacts);
    const setArtifacts = useAppStore((s) => s.setWorkspaceReviewArtifacts);

    const edits = useAppStore((s) => s.workspaceReviewEdits);
    const setEdit = useAppStore((s) => s.setWorkspaceReviewEdit);
    const resetEdits = useAppStore((s) => s.resetWorkspaceReviewEdits);
    const applyEditsToDoc = useAppStore((s) => s.applyWorkspaceReviewEditsToDoc);

    const results = useAppStore((s) => s.workspaceReviewResults);
    const setResult = useAppStore((s) => s.setWorkspaceReviewResult);

    // v0: review one artifact at a time.

    const [activeKey, setActiveKey] = useState<string>('');
    const [isExtracting, setIsExtracting] = useState(false);
    const outputRef = useRef<HTMLDivElement | null>(null);

    const [reviewingKey, setReviewingKey] = useState<string | null>(null);
    const [proofCollapsed, setProofCollapsed] = useState<Record<string, boolean>>({});
    const [reviewDetailsOpen, setReviewDetailsOpen] = useState<Record<string, boolean>>({});

    const [isEditingStatement, setIsEditingStatement] = useState(false);
    const [isEditingProof, setIsEditingProof] = useState(false);

    const statementEditRef = useRef<HTMLDivElement | null>(null);
    const proofEditRef = useRef<HTMLDivElement | null>(null);

    const active = useMemo(() => {
        const found = artifacts.find((a) => artifactKey(a) === activeKey);
        return found ?? null;
    }, [artifacts, activeKey]);

    // Keep a stable selection.
    useEffect(() => {
        if (activeKey && artifacts.some((a) => artifactKey(a) === activeKey)) return;
        const first = artifacts[0];
        setActiveKey(first ? artifactKey(first) : '');
    }, [artifacts, activeKey]);

    // Reset per-artifact edit UI state when switching selection.
    useEffect(() => {
        setIsEditingStatement(false);
        setIsEditingProof(false);
    }, [activeKey]);

    // UX: when editing, clicking outside the textarea should exit edit mode.
    useEffect(() => {
        if (!isEditingStatement && !isEditingProof) return;

        const onDown = (e: MouseEvent) => {
            const target = e.target as Node | null;
            if (!target) return;

            if (isEditingStatement && statementEditRef.current && !statementEditRef.current.contains(target)) {
                setIsEditingStatement(false);
            }
            if (isEditingProof && proofEditRef.current && !proofEditRef.current.contains(target)) {
                setIsEditingProof(false);
            }
        };

        document.addEventListener('mousedown', onDown, { capture: true } as any);
        return () => document.removeEventListener('mousedown', onDown, { capture: true } as any);
    }, [isEditingStatement, isEditingProof]);

    const refresh = async () => {
        setIsExtracting(true);
        try {
            const extracted = extractLatexArtifacts(doc || '');
            setArtifacts(extracted);
        } finally {
            setIsExtracting(false);
        }
    };

    // Auto-refresh while the panel is mounted (debounced).
    const debounceRef = useRef<number | null>(null);
    useEffect(() => {
        try {
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            debounceRef.current = window.setTimeout(() => {
                void refresh();
            }, 900);
            return () => {
                if (debounceRef.current) window.clearTimeout(debounceRef.current);
            };
        } catch {
            // ignore
            return;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc]);

    const runReviewOne = async (a: ExtractedArtifact) => {
        const key = artifactKey(a);
        const edited = edits[key];
        const { body: defaultStatementNoLabel } = stripFirstLabelFromBody(a.content);
        const statement = (edited?.statement ?? defaultStatementNoLabel).trim();
        const proof = (edited?.proof ?? a.proof ?? '').trim();

        // Ensure the label is preserved in the source we send to the model.
        const label = a.label ?? null;
        const statementWithLabel = ensureLabelInBody(statement, label);

        const paperContextBefore = buildPaperContextBefore(doc || '', a.artifactStartChar);

        // Clear previous result (so we don't show stale output).
        setResult(key, undefined as any);

        const out = await reviewArtifactSoundnessAction({
            type: a.type,
            envName: a.envName,
            title: a.title ?? null,
            label: a.label ?? null,
            paperContextBefore,
            content: statementWithLabel,
            proof: proof || null,
        } as any);

        if (!(out as any)?.success) throw new Error((out as any)?.error || 'Review failed.');

        setResult(key, {
            verdict: (out as any).verdict,
            summary: (out as any).summary,
            correctness: (out as any).correctness,
            clarity: (out as any).clarity,
            suggestedImprovement: (out as any).suggestedImprovement,
            model: (out as any).model ?? null,
            timestamp: new Date().toISOString(),
        });

        // After review completes, bring the output into view.
        try {
            requestAnimationFrame(() => {
                outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        } catch {
            // ignore
        }
    };


    const onReviewOne = async () => {
        if (!active) return;
        try {
            setReviewingKey(artifactKey(active));
            await runReviewOne(active);
        } catch (e: any) {
            toast({
                title: 'Review failed',
                description: e?.message || 'Review failed.',
                variant: 'destructive',
            });
        } finally {
            setReviewingKey((cur) => (cur === artifactKey(active) ? null : cur));
        }
    };

    const activeEdit = active ? edits[artifactKey(active)] : undefined;

    const activeDefault = useMemo(() => {
        if (!active) return { statement: '', label: null as string | null };
        const { body, label } = stripFirstLabelFromBody(active.content);
        return { statement: body, label: active.label ?? label ?? null };
    }, [active]);

    const activeStatement = (activeEdit?.statement ?? activeDefault.statement ?? '').trim();
    const activeProof = (activeEdit?.proof ?? active?.proof ?? '').trim();

    const activeResult = active ? results[artifactKey(active)] : undefined;
    const isReviewingThis = !!active && reviewingKey === artifactKey(active);

    useEffect(() => {
        if (!active) return;
        const k = artifactKey(active);
        setReviewDetailsOpen((prev) => {
            if (k in prev) return prev;
            return { ...prev, [k]: false };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeKey]);

    // Default: proofs are expanded.
    useEffect(() => {
        if (!active) return;
        const k = artifactKey(active);
        setProofCollapsed((prev) => {
            if (k in prev) return prev;
            return { ...prev, [k]: false };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeKey]);

    const defaultStatementForActive = activeDefault.statement.trim();
    const defaultProofForActive = (active?.proof ?? '').trim();
    const keyForActive = active ? artifactKey(active) : '';
    const editForActive = keyForActive ? edits[keyForActive] : undefined;
    const hasStatementEdit = !!active && !!editForActive && (editForActive.statement || '').trim() !== defaultStatementForActive;
    const hasProofEdit =
        !!active &&
        !!active.proofBlock &&
        !!editForActive &&
        ((editForActive.proof ?? '') as string).trim() !== defaultProofForActive;
    const hasAnyEdits = hasStatementEdit || hasProofEdit;

    const updateOrClearEdits = (k: string, next: { statement: string; proof?: string | null }) => {
        if (!active) return;
        const stmt = (next.statement || '').trim();
        const prf = (next.proof ?? (active.proofBlock ? defaultProofForActive : null)) as any;
        const prfTrim = prf == null ? '' : String(prf).trim();
        const stmtIsDefault = stmt === defaultStatementForActive;
        const prfIsDefault = !active.proofBlock ? true : prfTrim === defaultProofForActive;

        if (stmtIsDefault && prfIsDefault) {
            resetEdits(k);
            return;
        }
        setEdit(k, { statement: stmt, proof: active.proofBlock ? prfTrim : null });
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-3 border-b flex items-center justify-between gap-2">
                <div>
                    <div className="text-base font-semibold">Review</div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                        Extract artifacts (theorem, lemma, proposition, …) from your LaTeX and send them to an AI model for review.
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[240px_1fr]">
                {/* List */}
                <div className="border-r min-h-0 flex flex-col">
                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-2">
                            {artifacts.length === 0 ? (
                                <div className="p-3 text-sm text-muted-foreground">
                                    No theorem-like environments found.
                                </div>
                            ) : (
                                artifacts.map((a) => {
                                    const k = artifactKey(a);
                                    const r = results[k];
                                    const isActive = k === activeKey;
                                    return (
                                        <button
                                            key={k}
                                            type="button"
                                            onClick={() => setActiveKey(k)}
                                            className={
                                                'w-full text-left rounded-md border px-2 py-2 hover:bg-muted/30 transition ' +
                                                (isActive ? 'bg-primary/10 border-primary/30' : 'border-muted/50')
                                            }
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-xs font-medium truncate">
                                                    {a.type}
                                                    {a.label ? ` (${a.label})` : ''}
                                                </div>
                                                {r?.verdict && (
                                                    <Badge
                                                        variant={
                                                            r.verdict === 'OK'
                                                                ? 'secondary'
                                                                : r.verdict === 'ISSUE'
                                                                    ? 'destructive'
                                                                    : 'outline'
                                                        }
                                                    >
                                                        {r.verdict}
                                                    </Badge>
                                                )}
                                            </div>
                                            {a.title && (
                                                <div className="text-[11px] text-muted-foreground truncate">{a.title}</div>
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </ScrollArea>

                    <div className="p-2 border-t flex items-center justify-end">
                        <div className="text-xs text-muted-foreground">{artifacts.length} items</div>
                    </div>
                </div>

                {/* Detail */}
                <div className="min-h-0">
                    {!active ? (
                        <div className="p-6 text-sm text-muted-foreground">Select an artifact to review.</div>
                    ) : (
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-base font-semibold">
                                            {active.type} <span className="text-muted-foreground">{artifactKey(active)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                            onClick={() => setIsEditingStatement(true)}
                                            title="Edit statement"
                                        >
                                            <span>Statement</span>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        {hasStatementEdit && (
                                            <button
                                                type="button"
                                                className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                                aria-label="Revert statement"
                                                title="Revert"
                                                onClick={() => {
                                                    if (!active) return;
                                                    const k = artifactKey(active);
                                                    updateOrClearEdits(k, {
                                                        statement: defaultStatementForActive,
                                                        proof: active.proofBlock ? (editForActive?.proof ?? defaultProofForActive) : null,
                                                    });
                                                }}
                                            >
                                                <Undo2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    {isEditingStatement ? (
                                        <div ref={statementEditRef}>
                                            <Textarea
                                                value={activeStatement}
                                                onChange={(e) =>
                                                    setEdit(artifactKey(active), {
                                                        statement: e.target.value,
                                                        proof: active.proofBlock ? activeProof : null,
                                                    })
                                                }
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        setIsEditingStatement(false);
                                                    }
                                                }}
                                                rows={10}
                                                className="font-mono text-xs"
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="relative rounded-md border bg-muted/10 p-3 pr-10 cursor-text"
                                            title="Click to edit"
                                            onClick={() => setIsEditingStatement(true)}
                                        >
                                            <KatexRenderer content={activeStatement} macros={macros} />
                                        </div>
                                    )}
                                </div>

                                {active.proofBlock && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                                onClick={() => {
                                                    const k = artifactKey(active);
                                                    setProofCollapsed((prev) => ({ ...prev, [k]: !prev[k] }));
                                                }}
                                                aria-label={proofCollapsed[artifactKey(active)] ? 'Expand proof' : 'Collapse proof'}
                                                title={proofCollapsed[artifactKey(active)] ? 'Expand proof' : 'Collapse proof'}
                                            >
                                                {proofCollapsed[artifactKey(active)] ? (
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                )}
                                                <span>Proof</span>
                                            </button>

                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                onClick={() => setIsEditingProof(true)}
                                                title="Edit proof"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>

                                            {hasProofEdit && (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                                    aria-label="Revert proof"
                                                    title="Revert"
                                                    onClick={() => {
                                                        if (!active) return;
                                                        const k = artifactKey(active);
                                                        updateOrClearEdits(k, {
                                                            statement: (editForActive?.statement ?? defaultStatementForActive),
                                                            proof: defaultProofForActive,
                                                        });
                                                    }}
                                                >
                                                    <Undo2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                        {isEditingProof ? (
                                            <div ref={proofEditRef}>
                                                <Textarea
                                                    value={activeProof}
                                                    onChange={(e) =>
                                                        setEdit(artifactKey(active), {
                                                            statement: activeStatement,
                                                            proof: e.target.value,
                                                        })
                                                    }
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Escape') {
                                                            e.preventDefault();
                                                            setIsEditingProof(false);
                                                        }
                                                    }}
                                                    rows={22}
                                                    className="font-mono text-xs"
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                {!proofCollapsed[artifactKey(active)] && (
                                                    <div
                                                        className="relative rounded-md border bg-muted/10 p-3 pr-10 cursor-text"
                                                        title="Click to edit"
                                                        onClick={() => setIsEditingProof(true)}
                                                    >
                                                        <AdjointProse content={activeProof} macros={macros} />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Action row (kept consistent at the bottom) */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        onClick={onReviewOne}
                                        disabled={isReviewingThis}
                                    >
                                        {isReviewingThis ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Reviewing artifact…
                                            </>
                                        ) : (
                                            'Review with AI'
                                        )}
                                    </Button>

                                    {hasAnyEdits && (
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                applyEditsToDoc(artifactKey(active));
                                                toast({
                                                    title: 'Updated document',
                                                    description: 'Edits were written back into the LaTeX source.',
                                                });
                                            }}
                                        >
                                            Update document
                                        </Button>
                                    )}
                                </div>

                                {isReviewingThis && (
                                    <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                        <div className="font-medium text-foreground">Sending for review…</div>
                                        <div className="mt-1">We send the artifact together with the document context before the artifact.</div>
                                    </div>
                                )}

                                {results[artifactKey(active)] && (
                                    <>
                                        <Separator />
                                        <div className="space-y-2" ref={outputRef}>
                                            <div className="text-xs font-medium text-muted-foreground">AI review</div>
                                            <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <ReviewVerdictBadge v={results[artifactKey(active)].verdict} />
                                                </div>

                                                <KatexRenderer
                                                    content={results[artifactKey(active)].summary}
                                                    autoWrap={true}
                                                    className="text-sm"
                                                    macros={macros}
                                                />

                                                <Collapsible
                                                    open={!!reviewDetailsOpen[artifactKey(active)]}
                                                    onOpenChange={(open) =>
                                                        setReviewDetailsOpen((prev) => ({ ...prev, [artifactKey(active)]: open }))
                                                    }
                                                >
                                                    <CollapsibleTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                        >
                                                            {reviewDetailsOpen[artifactKey(active)] ? (
                                                                <ChevronDown className="h-3.5 w-3.5" />
                                                            ) : (
                                                                <ChevronRight className="h-3.5 w-3.5" />
                                                            )}
                                                            <span>Details</span>
                                                        </button>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent>
                                                        <div className="mt-2 space-y-2 text-sm whitespace-pre-wrap">
                                                            <div>
                                                                <div className="text-xs font-medium text-muted-foreground">Correctness</div>
                                                                <KatexRenderer
                                                                    content={cleanFeedback((results as any)[artifactKey(active)].correctness?.feedback)}
                                                                    autoWrap={true}
                                                                    className="text-sm"
                                                                    macros={macros}
                                                                />
                                                            </div>
                                                            <div>
                                                                <div className="text-xs font-medium text-muted-foreground">Clarity</div>
                                                                <KatexRenderer
                                                                    content={cleanFeedback(results[artifactKey(active)].clarity.feedback)}
                                                                    autoWrap={true}
                                                                    className="text-sm"
                                                                    macros={macros}
                                                                />
                                                            </div>

                                                            {Boolean((results as any)[artifactKey(active)]?.suggestedImprovement) && (
                                                                <div>
                                                                    <div className="text-xs font-medium text-muted-foreground">Suggested improvement</div>
                                                                    <KatexRenderer
                                                                        content={cleanFeedback((results as any)[artifactKey(active)]?.suggestedImprovement)}
                                                                        autoWrap={true}
                                                                        className="text-sm"
                                                                        macros={macros}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </CollapsibleContent>
                                                </Collapsible>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </div>
        </div>
    );
}
