'use client';

import { ExternalLink, Newspaper, Video, MessageSquareText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MathTriviaItem, MathTriviaKind } from '@/lib/math-trivia';

const kindMeta: Record<MathTriviaKind, { label: string; Icon: any; badgeVariant?: any }> = {
    video: { label: 'Video', Icon: Video },
    article: { label: 'Article', Icon: Newspaper },
    social: { label: 'Social', Icon: MessageSquareText, badgeVariant: 'secondary' },
};

export function TriviaCard({ item }: { item: MathTriviaItem }) {
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
        <Card className="w-full max-w-xl">
            <CardHeader className="pb-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    While the model is processing…
                </p>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <Badge variant={meta.badgeVariant} className="shrink-0">
                            <span className="inline-flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5" />
                                {meta.label}
                            </span>
                        </Badge>
                        <CardTitle className="text-sm font-semibold truncate">{item.title}</CardTitle>
                    </div>

                    <Button size="sm" variant="outline" onClick={open} className="shrink-0">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open link
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{item.blurb}</p>
            </CardContent>
        </Card>
    );
}
