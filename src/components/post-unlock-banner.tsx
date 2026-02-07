/*
 * One-time banner shown immediately after unlocking.
 *
 * Triggered by `UnlockClient` setting `sessionStorage` flag
 * `adjoint_show_post_unlock_banner_v1` before redirecting.
 */

'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const FLAG_KEY = 'adjoint_show_post_unlock_banner_v1';

export function PostUnlockBanner() {
    const pathname = usePathname();
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        // Never show on the unlock page itself.
        if (pathname === '/unlock') return;

        try {
            const v = window.sessionStorage.getItem(FLAG_KEY);
            if (v === '1') {
                setOpen(true);
                // One-time: clear immediately so refreshes don't re-show.
                window.sessionStorage.removeItem(FLAG_KEY);
            }
        } catch {
            // ignore
        }
    }, [pathname]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                aria-hidden="true"
                onClick={() => setOpen(false)}
            />

            <Alert className="relative w-full max-w-2xl border-border/60 bg-background/90 p-4 shadow-xl backdrop-blur">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setOpen(false)}
                    className="absolute right-2 top-2"
                    aria-label="Dismiss"
                >
                    <X className="h-4 w-4" />
                </Button>

                <AlertTitle className="mb-3 text-center font-headline tracking-wider text-primary">
                    Welcome to The Adjoint
                </AlertTitle>
                <AlertDescription>
                    <p>
                        This is an early prototype: things may change, break, and improve quickly. If
                        something feels a bit non-natural, that’s because we’re still constructing the
                        adjunction.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <a
                            href="https://dsleo.github.io/maths/2026/01/12/the-adjoint.html"
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4 hover:text-foreground"
                        >
                            To Know More →
                        </a>
                        <span aria-hidden="true">·</span>
                        <a
                            href="https://github.com/turnstilelabs/adjoint"
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4 hover:text-foreground"
                        >
                            Contribute →
                        </a>
                    </div>
                </AlertDescription>
            </Alert>
        </div>
    );
}
