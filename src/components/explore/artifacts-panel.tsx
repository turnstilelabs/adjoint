'use client';

import React from 'react';
import { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { KatexRenderer } from '@/components/katex-renderer';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

type Props = {
    artifacts: ExploreArtifacts | null;
    onPromote: (statement: string) => void;
    onExtract?: () => void;
    isExtracting?: boolean;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">{title}</div>
            {children}
        </div>
    );
}

function splitStatements(input: string): string[] {
    // Conservative splitter: supports simple bullet/numbered lists and newline-separated items.
    // Avoid splitting inside LaTeX math by keeping to line-level heuristics only.
    const normalized = (input ?? '').replace(/\r\n/g, '\n');
    // First split on newlines
    const lines = normalized.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out: string[] = [];
    for (const line of lines) {
        // Match bullets: -, *, • followed by space; or simple numbered like "1. text"
        const m = line.match(/^(?:[-*•]\s+|\d+\.\s+)(.*)$/);
        if (m && m[1]) {
            out.push(m[1].trim());
        } else {
            out.push(line);
        }
    }
    // Deduplicate and remove empties
    return Array.from(new Set(out.map((s) => s.trim()).filter(Boolean)));
}

function SingleStatementCarousel({ items, onPromote }: { items: string[]; onPromote: (s: string) => void }) {
    // Normalize & flatten any multi-statement entries
    const flat = items.flatMap(splitStatements);
    const [index, setIndex] = React.useState(0);
    const count = flat.length;
    const current = (flat[index] ?? '').trim();

    if (count === 0) {
        return <div className="text-sm text-muted-foreground">No statement extracted yet.</div>;
    }

    const go = (i: number) => setIndex(((i % count) + count) % count);

    return (
        <Card className="border-muted/50 overflow-hidden">
            <CardContent className="p-3 space-y-3 overflow-hidden">
                <div className="text-sm break-words whitespace-pre-wrap overflow-hidden">
                    <KatexRenderer content={current} />
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => onPromote(current)}>
                            Start proof attempt
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

export function ArtifactsPanel({ artifacts, onPromote, onExtract, isExtracting }: Props) {
    const a: ExploreArtifacts = artifacts ?? {
        candidateStatements: [],
        assumptions: [],
        examples: [],
        counterexamples: [],
        openQuestions: [],
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
                <Section title="Candidate Statements">
                    {a.candidateStatements.length === 0 ? (
                        <div className="space-y-3">
                            <div className="text-sm text-muted-foreground">No statement extracted yet.</div>
                            {onExtract && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={onExtract}
                                    disabled={Boolean(isExtracting)}
                                >
                                    {isExtracting && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {isExtracting ? 'Extracting…' : 'Extract statements'}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <SingleStatementCarousel
                            items={a.candidateStatements}
                            onPromote={onPromote}
                        />
                    )}
                </Section>

                <Separator />
                <Section title="Assumptions and Definitions">
                    {a.assumptions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">None yet.</div>
                    ) : (
                        <ul className="list-disc pl-5 text-sm space-y-1">
                            {a.assumptions.map((x, idx) => {
                                const text = (x ?? '').replace(/\s*\n\s*/g, ' ').trim();
                                return (
                                    <li key={idx} className="break-words">
                                        <span className="prose prose-invert max-w-none"><KatexRenderer inline content={text} /></span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Section>

                {a.examples.length > 0 && (
                    <>
                        <Separator />
                        <Section title="Examples">
                            <ul className="list-disc pl-5 text-sm space-y-1">
                                {a.examples.map((x, idx) => {
                                    const text = (x ?? '').replace(/\s*\n\s*/g, ' ').trim();
                                    return (
                                        <li key={idx} className="break-words">
                                            <span className="prose prose-invert max-w-none"><KatexRenderer inline content={text} /></span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Section>
                    </>
                )}

                {a.counterexamples.length > 0 && (
                    <>
                        <Separator />
                        <Section title="Counterexamples">
                            <ul className="list-disc pl-5 text-sm space-y-1">
                                {a.counterexamples.map((x, idx) => {
                                    const text = (x ?? '').replace(/\s*\n\s*/g, ' ').trim();
                                    return (
                                        <li key={idx} className="break-words">
                                            <span className="prose prose-invert max-w-none"><KatexRenderer inline content={text} /></span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Section>
                    </>
                )}

                {a.openQuestions.length > 0 && (
                    <>
                        <Separator />
                        <Section title="Open Questions">
                            <ul className="list-disc pl-5 text-sm space-y-1">
                                {a.openQuestions.map((x, idx) => {
                                    const text = (x ?? '').replace(/\s*\n\s*/g, ' ').trim();
                                    return (
                                        <li key={idx} className="break-words">
                                            <span className="prose prose-invert max-w-none"><KatexRenderer inline content={text} /></span>
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
