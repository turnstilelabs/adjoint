'use client';

import * as React from 'react';
import { KatexRenderer } from '@/components/katex-renderer';
import { Pencil } from 'lucide-react';

export type EditableArtifactItemHandle = {
    startEditing: () => void;
};

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
export const EditableArtifactItem = React.forwardRef<EditableArtifactItemHandle, EditableArtifactItemProps>(
    ({ value, onCommit, className, block = true }, ref) => {
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

        const startEditing = React.useCallback(() => setEditing(true), []);

        React.useImperativeHandle(ref, () => ({ startEditing }), [startEditing]);

        return (
            <div
                className={`group relative ${className ?? ''}`}
                onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startEditing();
                }}
            >
                {/* Layout box: keep height stable by always rendering the view layer */}
                <div
                    className={`${editing ? 'opacity-0' : ''} break-words whitespace-pre-wrap`}
                    title="Double click to edit"
                >
                    <KatexRenderer inline={!block} content={(value ?? '').trim()} />
                </div>

                {/* Edit affordance: visible on hover/focus so users discover editability */}
                {!editing && (
                    <button
                        type="button"
                        aria-label="Edit"
                        title="Edit"
                        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded p-1 hover:bg-muted/40"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            startEditing();
                        }}
                    >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                )}

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
    },
);

EditableArtifactItem.displayName = 'EditableArtifactItem';
