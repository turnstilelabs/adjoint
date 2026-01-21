"use client";

import { useEffect, useMemo, useState } from 'react';
import { SelectionToolbar } from '@/components/selection-toolbar';
import { selectionRangeToLatex } from '@/lib/selection-to-latex';
import { useAppStore } from '@/state/app-store';

type Anchor = { top: number; left: number };

function getSelectionHtml(range: Range): string {
    try {
        const frag = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(frag);
        return div.innerHTML;
    } catch {
        return '';
    }
}

/**
 * Global selection overlay:
 * - shows Copy + Ask AI when user highlights text anywhere
 * - avoids duplicating toolbars inside components that already provide a local selection toolbar
 */
export function GlobalSelectionOverlay() {
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const [selectedText, setSelectedText] = useState('');
    const [copyText, setCopyText] = useState<string>('');
    const [selectedHtml, setSelectedHtml] = useState<string | undefined>(undefined);

    // Gate SymPy verify to Workspace + Prover (Proof) mode only.
    const view = useAppStore((s) => s.view);
    const showVerify = view === 'workspace' || view === 'proof';

    const clear = () => {
        setAnchor(null);
        setSelectedText('');
        setCopyText('');
        setSelectedHtml(undefined);
    };

    const shouldIgnoreSelection = (node: Node | null) => {
        if (!node) return false;
        const el = (node as any).nodeType === 1 ? (node as Element) : (node.parentElement as Element | null);
        if (!el) return false;
        // If a local selection handler exists, don't duplicate.
        return Boolean(el.closest('[data-local-selection="1"]'));
    };

    const isSelectionEnabled = (node: Node | null) => {
        if (!node) return false;
        const el = (node as any).nodeType === 1 ? (node as Element) : (node.parentElement as Element | null);
        if (!el) return false;
        return Boolean(el.closest('[data-selection-enabled="1"]'));
    };

    useEffect(() => {
        const onMouseUp = () => {
            const sel = window.getSelection();
            const text = (sel?.toString() ?? '').trim();
            if (!sel || !text) {
                clear();
                return;
            }

            // Ignore selections in components that manage their own toolbars.
            if (shouldIgnoreSelection(sel.anchorNode) || shouldIgnoreSelection(sel.focusNode)) {
                clear();
                return;
            }

            // Restrict global selection actions to whitelisted UI regions.
            if (!isSelectionEnabled(sel.anchorNode) || !isSelectionEnabled(sel.focusNode)) {
                clear();
                return;
            }

            if (!sel.rangeCount) {
                clear();
                return;
            }

            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (!rect || (rect.width === 0 && rect.height === 0)) {
                clear();
                return;
            }

            setSelectedText(text);
            setCopyText(selectionRangeToLatex(range) || text);
            setSelectedHtml(getSelectionHtml(range));
            setAnchor({ top: rect.top, left: rect.left + rect.width / 2 });
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') clear();
        };

        const onScroll = () => {
            // Avoid a "floating" toolbar when user scrolls.
            if (anchor) clear();
        };

        document.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('scroll', onScroll, true);

        return () => {
            document.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('scroll', onScroll, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchor]);

    const noOp = useMemo(() => () => { }, []);

    return (
        <SelectionToolbar
            anchor={anchor}
            onRevise={noOp}
            selectedText={selectedText}
            copyText={copyText}
            selectedHtml={selectedHtml}
            canCheckAgain={false}
            showCheckAgain={false}
            showRevise={false}
            showVerify={showVerify}
        />
    );
}
