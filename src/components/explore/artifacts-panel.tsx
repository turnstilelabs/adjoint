'use client';

import React from 'react';
import { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Info, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useAppStore } from '@/state/app-store';
import { EditableArtifactItem, type EditableArtifactItemHandle } from '@/components/explore/editable-artifact-item';
import { splitStatements } from '@/lib/split-statements';

type Props = {
    artifacts: ExploreArtifacts | null;
    onPromote: (statement: string) => void;
    isExtracting?: boolean;

    /** Optional overrides so this panel can be reused outside Explore mode (e.g. Workspace Insights). */
    edits?: {
        candidateStatements: Record<string, string>;
        perStatement: Record<
            string,
            {
                assumptions: Record<string, string>;
                examples: Record<string, string>;
                counterexamples: Record<string, string>;
            }
        >;
    };
    setEdit?: (opts: {
        kind: 'candidateStatements' | 'assumptions' | 'examples' | 'counterexamples';
        statementKey?: string;
        original: string;
        edited: string;
    }) => void;
};

function Section({
    title,
    children,
    onEdit,
}: {
    title: string;
    children: React.ReactNode;
    onEdit?: () => void;
}) {
    const editable = Boolean(onEdit);
    const isCandidateStatements = title === 'Candidate Statements';
    const candidateInfo =
        'Experimental: Candidate statements are inferred automatically from the current conversation/document. They may be incomplete or incorrect.';

    return (
        <div className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <span>{title}</span>

                {isCandidateStatements && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-muted/30 text-muted-foreground">
                        Experimental
                    </span>
                )}

                {isCandidateStatements && (
                    <button
                        type="button"
                        aria-label="How candidate statements are inferred"
                        title={candidateInfo}
                        className={
                            'h-6 w-6 rounded flex items-center justify-center hover:bg-muted/30'
                        }
                    >
                        <Info className="h-3.5 w-3.5" />
                    </button>
                )}

                <button
                    type="button"
                    aria-label={editable ? `Edit ${title}` : undefined}
                    title={editable ? 'Edit' : undefined}
                    className={`h-6 w-6 rounded flex items-center justify-center ${editable ? 'hover:bg-muted/30' : 'opacity-40 cursor-default'
                        }`}
                    disabled={!editable}
                    onClick={onEdit}
                >
                    <Pencil className="h-3.5 w-3.5" />
                </button>
            </div>
            {children}
        </div>
    );
}

function SingleStatementCarousel({
    items,
    onPromote,
    edits,
    setEdit,
    onActiveStatementChange,
    editorRef,
}: {
    items: string[];
    onPromote: (s: string) => void;
    edits: Record<string, string>;
    setEdit: (opts: { kind: 'candidateStatements'; original: string; edited: string }) => void;
    onActiveStatementChange?: (stmt: string) => void;
    editorRef?: React.Ref<EditableArtifactItemHandle>;
}) {
    // Normalize & flatten any multi-statement entries
    // Display latest statements first.
    const flat = items.flatMap(splitStatements);
    const [index, setIndex] = React.useState(0);
    const count = flat.length;

    const original = (flat[index] ?? '').trim();
    const current = (edits[original] ?? original).trim();

    const onDelete = () => {
        try {
            // Remove statement from the source list by rewriting the special sentinel value.
            // Upstream UI/state should actually remove it from candidateStatements; edits overlay
            // is not sufficient because it only maps original->edited.
            window.dispatchEvent(
                new CustomEvent('artifacts:delete-candidate-statement', {
                    detail: { statement: original },
                }),
            );
        } catch {
            // ignore
        }
    };

    React.useEffect(() => {
        if (current && onActiveStatementChange) onActiveStatementChange(current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

    if (count === 0) {
        return <div className="text-sm text-muted-foreground">No statement extracted yet.</div>;
    }

    const go = (i: number) => setIndex(((i % count) + count) % count);

    return (
        <Card className="border-muted/50 overflow-hidden">
            <CardContent className="p-3 space-y-3 overflow-hidden">
                <div className="text-sm break-words whitespace-pre-wrap overflow-hidden">
                    <EditableArtifactItem
                        ref={editorRef}
                        value={current}
                        onCommit={(next) => setEdit({ kind: 'candidateStatements', original, edited: next })}
                        className="px-0"
                    />
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => onPromote(current)}>
                            Start proof attempt
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={onDelete}
                            title="Delete statement"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                    {/* Dots navigation */}
                    <div className="flex items-center gap-1">
                        <button
                            aria-label="Previous statement"
                            className="h-6 w-6 rounded-full border border-muted/50 text-xs flex items-center justify-center hover:bg-muted/30"
                            onClick={() => go(index - 1)}
                        >
                            ‹
                        </button>
                        <div className="flex gap-1">
                            {flat.map((_, i) => (
                                <button
                                    key={i}
                                    aria-label={`Go to statement ${i + 1}`}
                                    onClick={() => go(i)}
                                    className={`h-2 w-2 rounded-full ${i === index ? 'bg-primary' : 'bg-muted'}`}
                                />
                            ))}
                        </div>
                        <button
                            aria-label="Next statement"
                            className="h-6 w-6 rounded-full border border-muted/50 text-xs flex items-center justify-center hover:bg-muted/30"
                            onClick={() => go(index + 1)}
                        >
                            ›
                        </button>
                        <div className="ml-2 text-xs text-muted-foreground">{index + 1} / {count}</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function ArtifactsPanel({
    artifacts,
    onPromote,
    isExtracting,
    edits: editsOverride,
    setEdit: setEditOverride,
}: Props) {
    const exploreEdits = useAppStore((s) => s.exploreArtifactEdits);
    const exploreSetEdit = useAppStore((s) => s.setExploreArtifactEdit);

    const edits = editsOverride ?? exploreEdits;
    const setEdit = setEditOverride ?? exploreSetEdit;

    const a0: ExploreArtifacts = artifacts ?? {
        candidateStatements: [],
        statementArtifacts: {},
    };

    // Candidate statements are already ordered with latest first by the server.
    const a: ExploreArtifacts = a0;

    const [activeStatement, setActiveStatement] = React.useState<string>('');

    const firstAssumptionRef = React.useRef<EditableArtifactItemHandle | null>(null);
    const candidateStatementRef = React.useRef<EditableArtifactItemHandle | null>(null);

    const scoped = a.statementArtifacts[activeStatement] ?? {
        assumptions: [],
        examples: [],
        counterexamples: [],
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
                <Section
                    title="Candidate Statements"
                    onEdit={a.candidateStatements.length > 0 ? () => candidateStatementRef.current?.startEditing() : undefined}
                >
                    {isExtracting && a.candidateStatements.length > 0 && (
                        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Updating extracted statements…</span>
                        </div>
                    )}
                    {a.candidateStatements.length === 0 ? (
                        <div className="space-y-3">
                            {!isExtracting && (
                                <div className="text-sm text-muted-foreground">No statement extracted yet.</div>
                            )}

                            {isExtracting && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Finding candidate statements…</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <SingleStatementCarousel
                            items={a.candidateStatements}
                            onPromote={onPromote}
                            edits={edits.candidateStatements}
                            setEdit={(opts) => setEdit(opts)}
                            onActiveStatementChange={setActiveStatement}
                            editorRef={candidateStatementRef}
                        />
                    )}
                </Section>

                <Separator />
                <Section
                    title="Assumptions and Definitions"
                    onEdit={(scoped.assumptions?.length ?? 0) > 0 ? () => firstAssumptionRef.current?.startEditing() : undefined}
                >
                    {scoped.assumptions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">None yet.</div>
                    ) : (
                        <ul className="list-disc pl-5 text-sm space-y-1">
                            {scoped.assumptions.map((x: string, idx: number) => {
                                const original = (x ?? '').replace(/\s*\n\s*/g, ' ').trim();
                                const value = (
                                    edits.perStatement[activeStatement]?.assumptions?.[original] ??
                                    original
                                ).trim();
                                return (
                                    <li key={idx} className="break-words">
                                        <EditableArtifactItem
                                            ref={idx === 0 ? firstAssumptionRef : undefined}
                                            value={value}
                                            block={false}
                                            onCommit={(next) =>
                                                setEdit({
                                                    kind: 'assumptions',
                                                    statementKey: activeStatement,
                                                    original,
                                                    edited: next,
                                                })
                                            }
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Section>

                {scoped.examples.length > 0 && (
                    <>
                        <Separator />
                        <Section title="Examples">
                            <ul className="list-disc pl-5 text-sm space-y-1">
                                {scoped.examples.map((x: string, idx: number) => {
                                    const original = (x ?? '').replace(/\s*\n\s*/g, ' ').trim();
                                    const value = (
                                        edits.perStatement[activeStatement]?.examples?.[original] ??
                                        original
                                    ).trim();
                                    return (
                                        <li key={idx} className="break-words">
                                            <EditableArtifactItem
                                                value={value}
                                                block={false}
                                                onCommit={(next) =>
                                                    setEdit({
                                                        kind: 'examples',
                                                        statementKey: activeStatement,
                                                        original,
                                                        edited: next,
                                                    })
                                                }
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        </Section>
                    </>
                )}

                {scoped.counterexamples.length > 0 && (
                    <>
                        <Separator />
                        <Section title="Counterexamples">
                            <ul className="list-disc pl-5 text-sm space-y-1">
                                {scoped.counterexamples.map((x: string, idx: number) => {
                                    const original = (x ?? '').replace(/\s*\n\s*/g, ' ').trim();
                                    const value = (
                                        edits.perStatement[activeStatement]?.counterexamples?.[original] ??
                                        original
                                    ).trim();
                                    return (
                                        <li key={idx} className="break-words">
                                            <EditableArtifactItem
                                                value={value}
                                                block={false}
                                                onCommit={(next) =>
                                                    setEdit({
                                                        kind: 'counterexamples',
                                                        statementKey: activeStatement,
                                                        original,
                                                        edited: next,
                                                    })
                                                }
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        </Section>
                    </>
                )}

            </div>
        </div>
    );
}
