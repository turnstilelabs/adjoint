'use client';

import { InteractiveChat } from '../../chat/interactive-chat';
import { ProofSidebar } from '../../proof-sidebar';
import { ProofGraphView } from '../../proof-graph-view';
import { useAppStore } from '@/state/app-store';
import EditableProblemCard from '@/components/features/proof/editable-problem-card';
import ProofValidationFooter from '@/components/features/proof/proof-validation-footer';
import ProofSteps from '@/components/features/proof/proof-steps';
import RawProofView from '@/components/features/proof/raw-proof-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export default function ProofDisplay() {
    const isChatOpen = useAppStore((s) => s.isChatOpen);
    const viewMode = useAppStore((s) => s.viewMode);
    const setIsChatOpen = useAppStore((s) => s.setIsChatOpen);
    // In dev/HMR, new fields may be missing from the existing in-memory Zustand state.
    // Fall back to the historical default so the panel doesn't end up with width=0.
    const rawChatWidth = useAppStore((s) => (s as any).proofChatPanelWidth as any);
    const chatWidth =
        typeof rawChatWidth === 'number' && Number.isFinite(rawChatWidth) && rawChatWidth > 0
            ? rawChatWidth
            : 448;
    const setChatWidth = useAppStore((s) => (s as any).setProofChatPanelWidth as any);

    // Drag-to-resize state (desktop sidebar)
    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartWidthRef = useRef(0);

    // Hydrate persisted width once.
    useEffect(() => {
        try {
            // Ensure a sane default exists even if the field was missing pre-HMR.
            const cur = (useAppStore.getState() as any).proofChatPanelWidth;
            if (!(typeof cur === 'number' && Number.isFinite(cur) && cur > 0)) {
                if (typeof setChatWidth === 'function') {
                    setChatWidth(448);
                } else {
                    useAppStore.setState({ proofChatPanelWidth: 448 } as any);
                }
            }

            const raw = window.localStorage.getItem('adjoint.proof.chatPanelWidth.v1');
            const n = raw != null ? Number(raw) : NaN;
            if (!Number.isFinite(n)) return;
            if (typeof setChatWidth === 'function') {
                setChatWidth(n);
            } else {
                useAppStore.setState({ proofChatPanelWidth: n } as any);
            }
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const dx = e.clientX - dragStartXRef.current;
            const next = dragStartWidthRef.current - dx;
            if (typeof setChatWidth === 'function') {
                setChatWidth(next);
            } else {
                useAppStore.setState({ proofChatPanelWidth: next } as any);
            }
        };
        const onUp = () => {
            if (!isDraggingRef.current) return;
            isDraggingRef.current = false;
            try {
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            } catch {
                // ignore
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [setChatWidth]);

    return (
        <div className="inset-0 absolute overflow-hidden flex">
            <ProofSidebar />

            <main className="flex-1 min-w-0 min-h-0 h-full overflow-hidden flex flex-col">
                {/* Keep a comfortable reading width for proof content. */}
                <div className="mx-auto w-full max-w-4xl p-3 md:p-10 pb-0 gap-10 flex-1 min-h-0 flex flex-col">
                    <div className="pb-2">
                        <EditableProblemCard />
                    </div>

                    <ScrollArea className="flex-1 min-h-0 -mx-5 px-5">
                        {/* Removed the "Tentative Proof" / "Structured Tentative Proof" header + divider.
                            Keep some breathing room below the statement card. */}
                        <div className="pt-4" />

                        {viewMode === 'raw' && <RawProofView />}
                        {viewMode === 'structured' && <ProofSteps />}
                        {viewMode === 'graph' && <ProofGraphView />}

                        <ProofValidationFooter />
                    </ScrollArea>
                </div>
            </main>

            {isChatOpen && (
                <>
                    {/* Click-outside overlay to close chat panel */}
                    <div
                        className="fixed inset-0 z-20 bg-transparent xl:hidden"
                        onClick={() => setIsChatOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Desktop (xl+): resizable right sidebar */}
                    <div
                        className={cn('hidden xl:flex relative shrink-0 h-full')}
                        style={{ width: isChatOpen ? chatWidth : 0 }}
                    >
                        {/* Drag handle */}
                        <div
                            className="absolute left-0 top-0 h-full w-2 -translate-x-1 cursor-col-resize"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize chat panel"
                            onMouseDown={(e) => {
                                isDraggingRef.current = true;
                                dragStartXRef.current = e.clientX;
                                dragStartWidthRef.current = chatWidth;
                                try {
                                    document.body.style.cursor = 'col-resize';
                                    document.body.style.userSelect = 'none';
                                } catch {
                                    // ignore
                                }
                            }}
                        >
                            <div className="h-full w-px bg-border/60 ml-1" />
                        </div>

                        <aside className="h-full min-h-0 border-l bg-background overflow-y-auto flex flex-col w-full">
                            <InteractiveChat />
                        </aside>
                    </div>

                    {/* Mobile/tablet (<xl): keep existing overlay */}
                    <aside className="absolute inset-0 left-14 z-30 xl:hidden bg-background h-full overflow-y-auto flex flex-col">
                        <InteractiveChat />
                    </aside>
                </>
            )}
        </div>
    );
}
