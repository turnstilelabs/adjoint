'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/state/app-store';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KatexRenderer } from '@/components/katex-renderer';

export default function RawProofView() {
    const rawProof = useAppStore((s) => s.rawProof);
    const setRawProof = useAppStore((s) => s.setRawProof);
    const decomposeError = useAppStore((s) => s.decomposeError);
    const [isEditing, setIsEditing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            const length = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(length, length);
        }
    }, [isEditing]);

    const handleStopEditing = () => {
        setIsEditing(false);
    };

    return (
        <div className="space-y-3">
            {isEditing ? (
                <div className="rounded-md border bg-background p-3">
                    <Textarea
                        ref={textareaRef}
                        value={rawProof}
                        onChange={(e) => setRawProof(e.target.value)}
                        placeholder="Type or paste the tentative proof here..."
                        className="font-mono text-base leading-relaxed min-h-[65vh] resize-none"
                        onBlur={handleStopEditing}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                textareaRef.current?.blur();
                            }
                        }}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">Press Esc or click outside to stop editing.</p>
                </div>
            ) : (
                <div
                    className="w-full rounded-md border p-4 bg-background cursor-text min-h-[65vh]"
                    onDoubleClick={() => setIsEditing(true)}
                    role="textbox"
                    aria-label="Raw proof preview"
                >
                    {rawProof.trim() ? (
                        <div className="prose max-w-full max-h-[58vh] overflow-auto katex-wrap">
                            <KatexRenderer content={rawProof} />
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Double-click anywhere to start editing the proof.</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">Double-click anywhere to edit.</p>
                </div>
            )}

            {decomposeError && (
                <Alert variant="destructive">
                    <AlertDescription>{decomposeError}</AlertDescription>
                </Alert>
            )}
        </div>
    );
}
