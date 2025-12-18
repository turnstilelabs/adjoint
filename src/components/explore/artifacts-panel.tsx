'use client';

import { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { KatexRenderer } from '@/components/katex-renderer';
import { Card, CardContent } from '@/components/ui/card';

type Props = {
    artifacts: ExploreArtifacts | null;
    onPromote: (statement: string) => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">{title}</div>
            {children}
        </div>
    );
}

export function ArtifactsPanel({ artifacts, onPromote }: Props) {
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
                        <div className="text-sm text-muted-foreground">No statement extracted yet.</div>
                    ) : (
                        <div className="space-y-3">
                            {a.candidateStatements.map((s, idx) => {
                                const text = (s ?? '').trim();
                                return (
                                    <Card key={idx} className="border-muted/50 overflow-hidden">
                                        <CardContent className="p-3 space-y-2 overflow-hidden">
                                            <div className="text-sm break-words whitespace-pre-wrap overflow-hidden">
                                                <KatexRenderer content={text} />
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="secondary" onClick={() => onPromote(text)}>
                                                    Start proof attempt
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
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
                                {a.openQuestions.map((x, idx) => (
                                    <li key={idx} className="break-words">{(x ?? '').replace(/\s*\n\s*/g, ' ').trim()}</li>
                                ))}
                            </ul>
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
}
