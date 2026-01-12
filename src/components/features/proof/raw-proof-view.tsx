'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/state/app-store';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KatexRenderer } from '@/components/katex-renderer';
import { Pencil } from 'lucide-react';
import { SelectionToolbar } from '@/components/selection-toolbar';
import AdjointProse from '@/components/adjoint-prose';
import { selectionRangeToLatex } from '@/lib/selection-to-latex';

export default function RawProofView() {
    const rawProof = useAppStore((s) => s.rawProof);
    const setRawProof = useAppStore((s) => s.setRawProof);
    const decomposeError = useAppStore((s) => s.decomposeError);
    const editNonce = useAppStore((s) => s.rawProofEditNonce);
    const requestRawProofEdit = useAppStore((s) => s.requestRawProofEdit);
    const [isEditing, setIsEditing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const pendingCaretRef = useRef<null | { index: number; textSnapshot: string }>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const [selection, setSelection] = useState<{ text: string; anchor: { top: number; left: number } | null }>(
        { text: '', anchor: null },
    );

    const [copyText, setCopyText] = useState<string>('');

    const computeCaretIndexFromClick = useCallback(
        (click: { x: number; y: number; textSnapshot: string }): number => {
            // Best-effort: map click position in the rendered preview back to an index in the raw source.
            // We do:
            // 1) Find the caret offset inside the preview DOM (caretRangeFromPoint)
            // 2) Normalize both the preview textContent and raw source (some unicode/whitespace)
            // 3) Find the best matching neighborhood around the caret to locate it in the raw source.
            try {
                const container = document.getElementById('raw-proof-preview');
                if (!container) return rawProof.length;

                const rect = container.getBoundingClientRect();
                const x = Math.max(rect.left, Math.min(click.x, rect.right));
                const y = Math.max(rect.top, Math.min(click.y, rect.bottom));

                const anyDoc = document as any;
                let range: Range | null = null;
                if (typeof anyDoc.caretRangeFromPoint === 'function') {
                    range = anyDoc.caretRangeFromPoint(x, y);
                } else if (typeof anyDoc.caretPositionFromPoint === 'function') {
                    const pos = anyDoc.caretPositionFromPoint(x, y);
                    if (pos) {
                        range = document.createRange();
                        range.setStart(pos.offsetNode, pos.offset);
                        range.setEnd(pos.offsetNode, pos.offset);
                    }
                }

                // If we can't read a caret position, fall back to the end.
                if (!range || !range.endContainer) return rawProof.length;

                const prefixRange = document.createRange();
                prefixRange.setStart(container, 0);
                prefixRange.setEnd(range.endContainer, range.endOffset);

                const visibleAllRaw = (container.textContent || '').toString();
                const prefixRaw = prefixRange.toString();

                const normalizeForMatchWithMap = (input: string) => {
                    let norm = '';
                    const map: number[] = [];

                    const emit = (s: string, originalIndex: number) => {
                        for (let k = 0; k < s.length; k++) {
                            norm += s[k];
                            map.push(originalIndex);
                        }
                    };

                    const isZeroWidth = (ch: string) => /[\u200B-\u200D\uFEFF\u2060]/.test(ch);
                    const isWhitespace = (ch: string) => /\s/.test(ch);

                    for (let i = 0; i < input.length; i++) {
                        const ch = input[i];
                        if (isZeroWidth(ch)) continue;

                        // common unicode normalization
                        if (ch === '≥') {
                            emit('\\ge ', i);
                            continue;
                        }
                        if (ch === '≤') {
                            emit('\\le ', i);
                            continue;
                        }
                        if (ch === '∑') {
                            emit('\\sum ', i);
                            continue;
                        }
                        if (ch === '·' || ch === '×') {
                            emit('\\cdot ', i);
                            continue;
                        }
                        if (ch === '–' || ch === '−') {
                            emit('-', i);
                            continue;
                        }

                        const out = ch === '\u00A0' ? ' ' : ch;
                        if (isWhitespace(out)) {
                            // collapse whitespace runs
                            if (!norm.endsWith(' ')) {
                                emit(' ', i);
                            }
                            continue;
                        }

                        emit(out, i);
                    }

                    return { norm, map };
                };

                const commonSuffixLen = (a: string, b: string) => {
                    let i = 0;
                    const al = a.length,
                        bl = b.length;
                    while (i < al && i < bl && a[al - 1 - i] === b[bl - 1 - i]) i++;
                    return i;
                };
                const commonPrefixLen = (a: string, b: string) => {
                    let i = 0;
                    const al = a.length,
                        bl = b.length;
                    while (i < al && i < bl && a[i] === b[i]) i++;
                    return i;
                };

                const { norm: visibleAllNorm } = normalizeForMatchWithMap(visibleAllRaw);
                const { norm: prefixNorm } = normalizeForMatchWithMap(prefixRaw);
                const { norm: sourceNorm, map: sourceMap } = normalizeForMatchWithMap(rawProof);

                const caretNorm = prefixNorm.length;
                const approxNorm = Math.round(
                    (caretNorm / Math.max(1, visibleAllNorm.length)) * sourceNorm.length,
                );

                const ctx = 28;
                const left = visibleAllNorm.slice(Math.max(0, caretNorm - ctx), caretNorm);
                const right = visibleAllNorm.slice(caretNorm, caretNorm + ctx);

                // If left context is empty (very beginning), just use ratio.
                if (!left) {
                    const idxNorm = Math.max(0, Math.min(sourceNorm.length, approxNorm));
                    const idxRaw = idxNorm >= sourceMap.length ? rawProof.length : sourceMap[idxNorm];
                    return Math.max(0, Math.min(rawProof.length, idxRaw));
                }

                // Find occurrences of the left context in the source and score by how well right context matches.
                let bestIdxNorm = Math.max(0, Math.min(sourceNorm.length, approxNorm));
                let bestScore = -1;
                let bestDist = Number.MAX_SAFE_INTEGER;

                let start = 0;
                while (true) {
                    const found = sourceNorm.indexOf(left, start);
                    if (found < 0) break;
                    const cand = found + left.length;

                    const leftSrc = sourceNorm.slice(Math.max(0, cand - ctx), cand);
                    const rightSrc = sourceNorm.slice(cand, cand + ctx);

                    const score = commonSuffixLen(leftSrc, left) + commonPrefixLen(rightSrc, right);
                    const dist = Math.abs(cand - approxNorm);

                    if (score > bestScore || (score === bestScore && dist < bestDist)) {
                        bestScore = score;
                        bestDist = dist;
                        bestIdxNorm = cand;
                    }

                    start = found + Math.max(1, left.length);
                }

                const idxNorm = Math.max(0, Math.min(sourceNorm.length, bestIdxNorm));
                const idxRaw = idxNorm >= sourceMap.length ? rawProof.length : sourceMap[idxNorm];
                return Math.max(0, Math.min(rawProof.length, idxRaw));
            } catch {
                return rawProof.length;
            }
        },
        [rawProof],
    );

    useEffect(() => {
        if (!isEditing || !textareaRef.current) return;

        textareaRef.current.focus();

        // If we have a pending caret index (from a click in preview), place caret there.
        const pending = pendingCaretRef.current;
        pendingCaretRef.current = null;

        if (pending && pending.textSnapshot === rawProof) {
            textareaRef.current.setSelectionRange(pending.index, pending.index);
        } else {
            // Default behavior: caret at end.
            const length = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(length, length);
        }
    }, [isEditing, rawProof, computeCaretIndexFromClick]);

    // Selection toolbar for raw proof preview: Copy + Ask AI + Edit (jump caret)
    useEffect(() => {
        if (isEditing) {
            // In editing mode, let the textarea behave normally.
            setSelection({ text: '', anchor: null });
            return;
        }

        const onMouseUp = () => {
            const sel = window.getSelection();
            const text = (sel?.toString() ?? '').trim();
            if (!sel || !text) {
                setSelection({ text: '', anchor: null });
                setCopyText('');
                return;
            }

            const container = previewRef.current;
            if (!container) {
                setSelection({ text: '', anchor: null });
                return;
            }

            if (!container.contains(sel.anchorNode)) {
                setSelection({ text: '', anchor: null });
                return;
            }

            if (!sel.rangeCount) {
                setSelection({ text: '', anchor: null });
                setCopyText('');
                return;
            }
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSelection({
                text,
                anchor: { top: rect.top, left: rect.left + rect.width / 2 },
            });
            setCopyText(selectionRangeToLatex(range) || text);
        };

        document.addEventListener('mouseup', onMouseUp);
        return () => document.removeEventListener('mouseup', onMouseUp);
    }, [isEditing]);

    // External edit request (e.g. clicking the hover pencil icon)
    useEffect(() => {
        if (!editNonce) return;
        setIsEditing(true);
    }, [editNonce]);

    const handleStopEditing = () => {
        setIsEditing(false);
    };

    return (
        <div className="space-y-3" data-local-selection="1" data-selection-enabled="1">
            {selection.anchor && (
                <SelectionToolbar
                    anchor={selection.anchor}
                    selectedText={selection.text}
                    copyText={copyText}
                    onRevise={() => { }}
                    canCheckAgain={false}
                    showCheckAgain={false}
                    showRevise={false}
                    showEditSelection={true}
                    onEditSelection={() => {
                        // Enter edit mode and place caret near the selected text.
                        const idx = rawProof.indexOf(selection.text);
                        const caret = idx >= 0 ? idx : rawProof.length;
                        pendingCaretRef.current = { index: caret, textSnapshot: rawProof };
                        setIsEditing(true);
                        setSelection({ text: '', anchor: null });
                        setCopyText('');
                    }}
                />
            )}
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
                    className="group relative w-full rounded-md border p-4 bg-background cursor-text min-h-[65vh]"
                    ref={previewRef}
                    onDoubleClick={(e) => {
                        // Place the caret where the user clicked in the preview.
                        const idx = computeCaretIndexFromClick({
                            x: e.clientX,
                            y: e.clientY,
                            textSnapshot: rawProof,
                        });
                        pendingCaretRef.current = { index: idx, textSnapshot: rawProof };
                        setIsEditing(true);
                    }}
                    role="textbox"
                    aria-label="Raw proof preview"
                >
                    <button
                        type="button"
                        aria-label="Edit raw proof"
                        title="Edit"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            requestRawProofEdit();
                        }}
                        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-foreground"
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                    {rawProof.trim() ? (
                        <div
                            id="raw-proof-preview"
                            className="katex-wrap"
                        >
                            <AdjointProse content={rawProof} />
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Click anywhere to start editing the proof.</p>
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

