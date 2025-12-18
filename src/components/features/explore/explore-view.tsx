'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/state/app-store';
import { ExploreChatMessages } from '@/components/explore/explore-chat-messages';
import { ExploreChatInput } from '@/components/explore/explore-chat-input';
import { ArtifactsPanel } from '@/components/explore/artifacts-panel';
import { useSendExploreMessage } from '@/components/explore/useSendExploreMessage';
import { useToast } from '@/hooks/use-toast';

function ResizableExploreLayout({ children }: { children: React.ReactNode }) {
    const [width, setWidth] = useState<number>(420); // px
    const containerRef = useRef<HTMLDivElement | null>(null);

    const onMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const onMove = (evt: MouseEvent) => {
            const el = containerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const x = Math.max(rect.left, Math.min(evt.clientX, rect.right));
            const right = Math.max(320, Math.min(600, rect.right - x));
            setWidth(right);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.removeAttribute('data-explore-dragging');
        };
        document.body.setAttribute('data-explore-dragging', '1');
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div ref={containerRef} className="flex-1 min-h-0 flex items-stretch gap-3">
            {/* Left content passed as first child, then handle, then aside wrapper */}
            {children instanceof Array ? (
                <>
                    {children[0]}
                    {/* Handle */}
                    <div
                        onMouseDown={onMouseDown}
                        className="w-2 cursor-col-resize select-none rounded-md bg-transparent hover:bg-muted/50 active:bg-muted"
                        title="Drag to resize"
                    />
                    <div style={{ width }} className="min-h-0">
                        {children[2]}
                    </div>
                </>
            ) : (
                children
            )}
        </div>
    );
}

function ResizableHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
    return (
        <div
            onMouseDown={onMouseDown}
            className="w-2 cursor-col-resize select-none rounded-md bg-transparent hover:bg-muted/50 active:bg-muted"
            title="Drag to resize"
        />
    );
}

function ResizableAside({ children }: { children: React.ReactNode }) {
    // Width is handled by parent wrapper via inline style injection
    return (
        <aside className="min-h-0 h-full border rounded-lg bg-background overflow-hidden">
            {children}
        </aside>
    );
}

import { ExploreSidebar } from '@/components/explore-sidebar';

export default function ExploreView() {
    const promoteToProof = useAppStore((s) => s.promoteToProof);
    const artifacts = useAppStore((s) => s.exploreArtifacts);
    const exploreMessages = useAppStore((s) => s.exploreMessages);
    const exploreSeed = useAppStore((s) => s.exploreSeed);
    const sendExploreMessage = useSendExploreMessage();
    const [isExtracting, setIsExtracting] = useState(false);
    const { toast } = useToast();
    const [lastExtractHadNoStatements, setLastExtractHadNoStatements] = useState(false);

    const extractNow = async () => {
        if (isExtracting) return;
        setIsExtracting(true);
        try {
            // Re-run extraction from the current context.
            // Prefer the last user message; otherwise fall back to the current seed.
            const lastUserMsg = [...exploreMessages].reverse().find((m) => m.role === 'user')?.content;
            const basis = (lastUserMsg ?? exploreSeed ?? '').trim();

            setLastExtractHadNoStatements(false);

            await sendExploreMessage(basis || 'Extract artifacts from the conversation.', {
                suppressUser: true,
                displayAs: '',
                extractOnly: true,
            });
        } finally {
            setIsExtracting(false);
        }
    };

    useEffect(() => {
        // After a manual extraction attempt completes, if we still have no candidate statements,
        // make it explicit to the user.
        if (!isExtracting && !lastExtractHadNoStatements && artifacts && artifacts.candidateStatements.length === 0) {
            setLastExtractHadNoStatements(true);
            toast({
                title: 'No statements found',
                description:
                    'Adjoint could not extract any candidate statement from the current conversation. Try rephrasing or providing a cleaner statement.',
            });
        }
    }, [artifacts, isExtracting, lastExtractHadNoStatements, toast]);

    return (
        <div className="inset-0 absolute overflow-hidden flex">
            <ExploreSidebar />
            <main className="flex-1 min-w-0 min-h-0 h-full overflow-hidden flex flex-col">
                <div className="mx-auto w-full max-w-6xl p-2 md:p-4 pb-0 gap-3 flex-1 min-h-0 flex flex-col">
                    {/* Header intentionally minimized to let content start higher */}

                    <ResizableExploreLayout>
                        <section className="min-h-0 flex-1 flex flex-col border rounded-lg bg-background overflow-hidden">
                            <ExploreChatMessages />
                            <ExploreChatInput />
                        </section>

                        {/* Handle injected by layout; keeping component for clarity */}
                        <ResizableHandle onMouseDown={() => { /* handled by parent */ }} />

                        <ResizableAside>
                            <ArtifactsPanel
                                artifacts={artifacts}
                                onPromote={(statement: string) => promoteToProof(statement)}
                                onExtract={extractNow}
                                isExtracting={isExtracting}
                            />
                        </ResizableAside>
                    </ResizableExploreLayout>
                </div>
            </main>
        </div>
    );
}
