'use client';

import { ExternalLink, MessageSquareText, Newspaper, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { MathTriviaItem, MathTriviaKind } from '@/lib/math-trivia';

const kindMeta: Record<MathTriviaKind, { label: string; Icon: any; badgeVariant?: any }> = {
    video: { label: 'Video', Icon: Video },
    article: { label: 'Article', Icon: Newspaper },
    social: { label: 'Social', Icon: MessageSquareText, badgeVariant: 'secondary' },
};

export function ChatTriviaCard({ item }: { item: MathTriviaItem }) {
    const meta = kindMeta[item.kind] ?? kindMeta.article;
    const Icon = meta.Icon;

    const open = () => {
        try {
            window.open(item.url, '_blank', 'noopener,noreferrer');
        } catch {
            // ignore
        }
    };

    return (
        <Card className="w-full bg-muted/20 border-border/60 shadow-none">
            <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                            <Badge variant={meta.badgeVariant} className="shrink-0">
                                <span className="inline-flex items-center gap-1.5">
                                    <Icon className="h-3.5 w-3.5" />
                                    {meta.label}
                                </span>
                            </Badge>
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                While I’m thinking…
                            </div>
                        </div>
                        <div className="text-sm font-medium leading-snug truncate">{item.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.blurb}</div>
                    </div>

                    <Button size="sm" variant="outline" onClick={open} className="shrink-0 h-8 px-2">
                        <ExternalLink className="h-4 w-4" />
                        <span className="sr-only">Open link</span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
