'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { parseArxivId } from '@/lib/arxiv';
import { cn } from '@/lib/utils';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, Upload, Crosshair, ChevronLeft, ChevronRight, PlusSquare, MessageSquareText } from 'lucide-react';

// Configure PDF.js worker.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAddToWorkspace: (latex: string) => void;
    onAskInChat: (opts: { latex: string; question: string }) => void;
};

type Rect = { x: number; y: number; w: number; h: number };

function clampRect(r: Rect): Rect {
    const w = Math.max(1, r.w);
    const h = Math.max(1, r.h);
    return { ...r, w, h };
}

export function AskPaperModal({ open, onOpenChange, onAddToWorkspace, onAskInChat }: Props) {
    const { toast } = useToast();

    const [tab, setTab] = useState<'arxiv' | 'upload'>('arxiv');
    const [arxivInput, setArxivInput] = useState('');
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState<number>(1);

    const [selectMode, setSelectMode] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [rect, setRect] = useState<Rect | null>(null);

    const [question, setQuestion] = useState('');
    const [latex, setLatex] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);

    const pageContainerRef = useRef<HTMLDivElement | null>(null);
    const pageCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Create/revoke object URL for uploads.
    useEffect(() => {
        if (!pdfFile) {
            setPdfUrl(null);
            return;
        }
        const url = URL.createObjectURL(pdfFile);
        setPdfUrl(url);
        return () => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                // ignore
            }
        };
    }, [pdfFile]);

    // Reset state when opening/closing.
    useEffect(() => {
        if (!open) {
            setSelectMode(false);
            setDragStart(null);
            setRect(null);
            setLatex('');
            setQuestion('');
            setIsExtracting(false);
            setNumPages(0);
            setPageNumber(1);
            return;
        }
    }, [open]);

    const effectivePdf = useMemo(() => {
        if (tab === 'upload') return pdfUrl;
        const parsed = parseArxivId(arxivInput);
        if (!parsed) return null;
        // Prefer export.arxiv.org (more permissive).
        return `https://export.arxiv.org/pdf/${encodeURIComponent(parsed.canonical)}.pdf`;
    }, [tab, pdfUrl, arxivInput]);

    const onDropFile = (file: File | null) => {
        if (!file) return;
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            toast({ title: 'Unsupported file', description: 'Please upload a PDF file.', variant: 'destructive' });
            return;
        }
        setPdfFile(file);
        setTab('upload');
    };

    const getLocalPoint = (clientX: number, clientY: number) => {
        const el = pageContainerRef.current;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = clientX - r.left;
        const y = clientY - r.top;
        return { x: Math.max(0, Math.min(r.width, x)), y: Math.max(0, Math.min(r.height, y)) };
    };

    const beginDrag = (clientX: number, clientY: number) => {
        const p = getLocalPoint(clientX, clientY);
        if (!p) return;
        setDragStart(p);
        setRect({ x: p.x, y: p.y, w: 1, h: 1 });
    };

    const updateDrag = (clientX: number, clientY: number) => {
        if (!dragStart) return;
        const p = getLocalPoint(clientX, clientY);
        if (!p) return;
        const x = Math.min(dragStart.x, p.x);
        const y = Math.min(dragStart.y, p.y);
        const w = Math.abs(p.x - dragStart.x);
        const h = Math.abs(p.y - dragStart.y);
        setRect(clampRect({ x, y, w, h }));
    };

    const endDrag = () => {
        setDragStart(null);
        setSelectMode(false);
    };

    const extractNow = async () => {
        if (!rect) {
            toast({ title: 'No selection', description: 'Drag a rectangle on the PDF page first.', variant: 'destructive' });
            return;
        }
        const canvas = pageCanvasRef.current;
        const container = pageContainerRef.current;
        if (!canvas || !container) {
            toast({ title: 'Not ready', description: 'PDF page is not ready yet.', variant: 'destructive' });
            return;
        }

        // Convert container-relative rect to canvas pixels.
        const scaleX = canvas.width / container.clientWidth;
        const scaleY = canvas.height / container.clientHeight;

        const sx = Math.floor(rect.x * scaleX);
        const sy = Math.floor(rect.y * scaleY);
        const sw = Math.floor(rect.w * scaleX);
        const sh = Math.floor(rect.h * scaleY);

        if (sw < 2 || sh < 2) {
            toast({ title: 'Selection too small', description: 'Please select a larger region.', variant: 'destructive' });
            return;
        }

        // Copy the region into an offscreen canvas.
        const out = document.createElement('canvas');
        out.width = sw;
        out.height = sh;
        const ctx = out.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        const dataUrl = out.toDataURL('image/png');

        setIsExtracting(true);
        try {
            const resp = await fetch('/api/paper/extract-latex', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageDataUrl: dataUrl, hint: question || undefined }),
            });
            const data = await resp.json().catch(() => null);
            if (!resp.ok || !data?.ok) {
                throw new Error(data?.error || `Extract failed (HTTP ${resp.status})`);
            }
            const outLatex = String(data?.latex ?? '').trim();
            if (!outLatex) throw new Error('Model returned empty LaTeX.');
            setLatex(outLatex);
            toast({ title: 'LaTeX extracted', description: `Model: ${data?.model || 'unknown'}` });
        } catch (e: any) {
            toast({ title: 'Extraction failed', description: e?.message || 'Could not extract LaTeX.', variant: 'destructive' });
        } finally {
            setIsExtracting(false);
        }
    };

    const canAdd = latex.trim().length > 0;
    const canAsk = canAdd && question.trim().length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[1100px]">
                <DialogHeader>
                    <DialogTitle>Ask about a paper</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-[360px_1fr]">
                    {/* Left column */}
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={tab === 'arxiv' ? 'secondary' : 'outline'}
                                onClick={() => setTab('arxiv')}
                                className="flex-1"
                            >
                                arXiv URL
                            </Button>
                            <Button
                                type="button"
                                variant={tab === 'upload' ? 'secondary' : 'outline'}
                                onClick={() => setTab('upload')}
                                className="flex-1"
                            >
                                Upload PDF
                            </Button>
                        </div>

                        {tab === 'arxiv' ? (
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">Paste an arXiv link (abs/pdf)</div>
                                <Input
                                    value={arxivInput}
                                    onChange={(e) => setArxivInput(e.target.value)}
                                    placeholder="https://arxiv.org/abs/1706.03762"
                                />
                                <div className="text-xs text-muted-foreground">
                                    {parseArxivId(arxivInput) ? 'Detected arXiv id ✓' : '—'}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div
                                    className={cn(
                                        'rounded-lg border border-dashed p-4 text-sm text-muted-foreground',
                                        'flex flex-col items-center justify-center gap-2',
                                    )}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const f = e.dataTransfer.files?.[0] || null;
                                        onDropFile(f);
                                    }}
                                >
                                    <Upload className="h-5 w-5" />
                                    <div>Drag & drop a PDF here</div>
                                    <div className="text-xs">or</div>
                                    <label className="cursor-pointer">
                                        <input
                                            type="file"
                                            accept="application/pdf,.pdf"
                                            className="hidden"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0] || null;
                                                // allow reselect same file
                                                e.target.value = '';
                                                onDropFile(f);
                                            }}
                                        />
                                        <Button type="button" variant="secondary" size="sm">
                                            Choose file
                                        </Button>
                                    </label>
                                    {pdfFile ? (
                                        <div className="text-xs text-foreground/80 break-all">{pdfFile.name}</div>
                                    ) : null}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">Question (optional hint for OCR)</div>
                            <Textarea
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="What does this step mean?"
                                rows={4}
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">Extracted LaTeX</div>
                            <Textarea
                                value={latex}
                                onChange={(e) => setLatex(e.target.value)}
                                placeholder="(Extracted LaTeX will appear here)"
                                rows={10}
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>

                    {/* Right column */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">
                                {effectivePdf ? 'PDF loaded' : 'Provide an arXiv URL or upload a PDF'}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setRect(null);
                                        setSelectMode(true);
                                    }}
                                    disabled={!effectivePdf}
                                    title="Select a rectangle on the page"
                                >
                                    <Crosshair className="h-4 w-4 mr-2" />
                                    Select region
                                </Button>

                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void extractNow()}
                                    disabled={!effectivePdf || !rect || isExtracting}
                                >
                                    {isExtracting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Extracting…
                                        </>
                                    ) : (
                                        'Extract LaTeX'
                                    )}
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                                    disabled={pageNumber <= 1}
                                    aria-label="Prev page"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-xs text-muted-foreground">
                                    Page {pageNumber} / {numPages || '—'}
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setPageNumber((p) => Math.min(numPages || p + 1, p + 1))}
                                    disabled={numPages > 0 && pageNumber >= numPages}
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>

                            {rect ? (
                                <div className="text-xs text-muted-foreground">
                                    Selected: {Math.round(rect.w)}×{Math.round(rect.h)} px (screen)
                                </div>
                            ) : null}
                        </div>

                        <div
                            ref={pageContainerRef}
                            className={cn(
                                'relative w-full overflow-auto rounded-lg border bg-muted/10',
                                selectMode ? 'cursor-crosshair' : 'cursor-default',
                            )}
                            onMouseDown={(e) => {
                                if (!selectMode) return;
                                beginDrag(e.clientX, e.clientY);
                            }}
                            onMouseMove={(e) => {
                                if (!selectMode) return;
                                updateDrag(e.clientX, e.clientY);
                            }}
                            onMouseUp={() => {
                                if (!selectMode) return;
                                endDrag();
                            }}
                            onMouseLeave={() => {
                                if (!selectMode) return;
                                endDrag();
                            }}
                            style={{ height: '70vh' }}
                        >
                            {effectivePdf ? (
                                <Document
                                    file={effectivePdf}
                                    loading={<div className="p-4 text-sm text-muted-foreground">Loading PDF…</div>}
                                    onLoadSuccess={(pdf: any) => {
                                        setNumPages(pdf?.numPages ?? 0);
                                        setPageNumber(1);
                                    }}
                                    onLoadError={(err: any) => {
                                        toast({ title: 'PDF load failed', description: String(err?.message || err), variant: 'destructive' });
                                    }}
                                >
                                    <Page
                                        pageNumber={pageNumber}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        canvasRef={(c: HTMLCanvasElement) => {
                                            pageCanvasRef.current = c;
                                        }}
                                    />
                                </Document>
                            ) : (
                                <div className="p-6 text-sm text-muted-foreground">No PDF loaded.</div>
                            )}

                            {rect ? (
                                <div
                                    className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                                    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            setLatex('');
                            setRect(null);
                            setSelectMode(false);
                        }}
                    >
                        Clear
                    </Button>

                    <Button
                        type="button"
                        variant="secondary"
                        disabled={!canAdd}
                        onClick={() => {
                            onAddToWorkspace(latex);
                            toast({ title: 'Added to Workspace', description: 'Inserted extracted LaTeX into the editor.' });
                        }}
                    >
                        <PlusSquare className="h-4 w-4 mr-2" />
                        Add to workspace
                    </Button>

                    <Button
                        type="button"
                        disabled={!canAsk}
                        onClick={() => {
                            onAskInChat({ latex, question });
                            toast({ title: 'Sent to chat', description: 'Inserted into Workspace and opened chat.' });
                        }}
                    >
                        <MessageSquareText className="h-4 w-4 mr-2" />
                        Ask in chat
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
