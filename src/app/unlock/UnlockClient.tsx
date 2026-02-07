"use client";

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { YellowSnowBackground } from '@/components/yellow-snow-background';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';

export default function UnlockClient({ initialNext }: { initialNext?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = useMemo(
        () => searchParams.get('next') || initialNext || '/',
        [searchParams, initialNext]
    );

    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const statement = useMemo(
        () =>
            [
                'Let $\\mathcal{C}$ be a locally small category, and let $F : \\mathcal{C} \\to \\mathbf{Set}$ be a functor. Then, for any object $C \\in \\mathcal{C}$, there is a natural bijection:',
                '\\[',
                '\\mathrm{Nat}(\\mathrm{Hom}_{\\mathcal{C}}(C, -), F) \\;\\; \\cong \\;\\; F(C).',
                '\\]',
            ].join('\n'),
        []
    );

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/unlock', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password, next }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                setError(body?.error || 'Invalid password. Please try again.');
                return;
            }

            // Persist unlock state for client-side gating.
            try {
                window.localStorage.setItem('adjoint_unlocked_v2', '1');
            } catch {
                // ignore
            }

            // Show a one-time post-unlock banner on the next page.
            // Use sessionStorage so it naturally resets on a new tab/session.
            try {
                window.sessionStorage.setItem('adjoint_show_post_unlock_banner_v1', '1');
            } catch {
                // ignore
            }

            router.replace(next);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
            <YellowSnowBackground />
            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/40 to-transparent" />

            <div className="relative z-20 mx-auto w-full max-w-xl px-4">
                <Card className="border-border/60 bg-background/80 shadow-xl backdrop-blur">
                    <CardContent className="space-y-6 p-8">
                        <div className="text-base leading-relaxed text-foreground/80">
                            <KatexRenderer
                                content={statement}
                                autoWrap={false}
                                className="unlock-statement"
                                // Avoid KaTeX emitting MathML text nodes that can duplicate
                                // inline math when combined with aggressive wrapping styles.
                                output="html"
                            />
                        </div>

                        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

                        <form onSubmit={onSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    autoFocus
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            // Some environments don't submit forms on Enter without an explicit submit.
                                            // Ensure Enter submits reliably.
                                            e.currentTarget.form?.requestSubmit();
                                        }
                                    }}
                                    disabled={submitting}
                                    className="h-12 text-base"
                                />
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
