'use client';

import * as React from 'react';
import { KatexRenderer } from '@/components/katex-renderer';

export type EditableArtifactItemProps = {
    value: string;
    onCommit: (next: string) => void;
    className?: string;
    /**
     * If true, render the value as block content (default).
     * If false, render as inline content.
     */
    block?: boolean;
};

/**
 * Inline double-click editor for a single artifact item.
 *
 * UX:
 * - double click to edit
 * - Enter commits (Shift+Enter for newline)
 * - Esc cancels
 * - blur commits
 */
export function EditableArtifactItem({ value, onCommit, className, block = true }: EditableArtifactItemProps) {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(value);

    React.useEffect(() => {
        if (!editing) setDraft(value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const commit = () => {
        const next = (draft ?? '').trim();
        if (next) onCommit(next);
        setEditing(false);
    };

    const cancel = () => {
        setDraft(value);
        setEditing(false);
    };

    return (
        <div
            className={`relative ${className ?? ''}`}
            onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setEditing(true);
            }}
        >
            {/* Layout box: keep height stable by always rendering the view layer */}
            <div
                className={`${editing ? 'opacity-0' : ''} break-words whitespace-pre-wrap`}
                title="Double click to edit"
            >
                <KatexRenderer inline={!block} content={(value ?? '').trim()} />
            </div>

            {editing && (
                <textarea
                    className="absolute inset-0 w-full h-full bg-transparent text-sm leading-relaxed outline-none resize-none overflow-hidden"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            commit();
                        }
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            cancel();
                        }
                    }}
                />
            )}
        </div>
    );
}
