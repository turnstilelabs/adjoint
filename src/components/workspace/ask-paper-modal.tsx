/* eslint-disable react/no-unescaped-entities */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseArxivId } from '@/lib/arxiv';
import { cn } from '@/lib/utils';
import { FilePlus, Loader2 } from 'lucide-react';

type AskPaperModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToWorkspace: (latex: string, sourceName?: string) => void;
  onImportTex?: (file: File) => Promise<void> | void;
};

type PdfDoc = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<any>;
  destroy?: () => void;
};

type Rect = { x: number; y: number; width: number; height: number };
type SelectionRect = Rect & { pageIndex: number };

const MIN_SELECTION = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRect(rect: Rect, maxW: number, maxH: number): Rect {
  const x = clamp(rect.x, 0, maxW);
  const y = clamp(rect.y, 0, maxH);
  const w = clamp(rect.width, 0, maxW - x);
  const h = clamp(rect.height, 0, maxH - y);
  return { x, y, width: w, height: h };
}

export function AskPaperModal({
  open,
  onOpenChange,
  onAddToWorkspace,
  onImportTex,
}: AskPaperModalProps) {
  const [sourceInput, setSourceInput] = useState('');
  const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [renderScale, setRenderScale] = useState(1.1);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [latex, setLatex] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const pdfjsRef = useRef<any>(null);
  const loadIdRef = useRef(0);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const dragStartRef = useRef<{ pageIndex: number; x: number; y: number } | null>(null);
  const extractAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canExtract = !!selection && selection.width >= MIN_SELECTION && selection.height >= MIN_SELECTION;

  const resetState = useCallback(() => {
    loadIdRef.current += 1;
    setSelection(null);
    setLatex('');
    setSourceName('');
    setError(null);
    setErrorDetail(null);
    setIsLoadingPdf(false);
    setIsRenderingPage(false);
    setIsExtracting(false);
    extractAbortRef.current?.abort();
    extractAbortRef.current = null;
    setNumPages(0);
    setPageSizes([]);
    pdfjsRef.current = null;
    setPdfDoc((prev) => {
      try {
        prev?.destroy?.();
      } catch {
        // ignore
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const ensurePdfjs = useCallback(async () => {
    if (pdfjsRef.current) return pdfjsRef.current;
    try {
      let mod: any = null;
      try {
        mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
      } catch {
        mod = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
      }
      mod.GlobalWorkerOptions.workerSrc = '/workers/pdf.worker.mjs';
      pdfjsRef.current = mod;
      return mod;
    } catch (e: any) {
      setError('render');
      setErrorDetail(String(e?.message || e || 'Failed to load PDF renderer.'));
      throw new Error('Failed to load PDF renderer.');
    }
  }, []);

  const loadPdfFromBytes = useCallback(
    async (bytes: ArrayBuffer) => {
      setError(null);
      setErrorDetail(null);
      setLatex('');
      setSelection(null);
      setPageSizes([]);
      canvasRefs.current = [];
      setIsLoadingPdf(true);
      const loadId = ++loadIdRef.current;

      try {
        const pdfjs = await ensurePdfjs();
        let doc: PdfDoc | null = null;
        try {
          const loadingTask = pdfjs.getDocument({ data: bytes, disableWorker: true });
          doc = (await loadingTask.promise) as PdfDoc;
        } catch {
          // Fallback: try worker if main-thread rendering failed.
          const loadingTask = pdfjs.getDocument({ data: bytes });
          doc = (await loadingTask.promise) as PdfDoc;
        }
        if (!doc) throw new Error('Failed to load PDF.');
        if (loadId !== loadIdRef.current) {
          doc?.destroy?.();
          return;
        }

        setPdfDoc((prev) => {
          try {
            prev?.destroy?.();
          } catch {
            // ignore
          }
          return doc;
        });
        setNumPages(doc.numPages || 0);
      } catch (e: any) {
        setError('load');
        setErrorDetail(String(e?.message || e || 'Failed to load PDF.'));
      } finally {
        if (loadId === loadIdRef.current) {
          setIsLoadingPdf(false);
        }
      }
    },
    [ensurePdfjs],
  );

  const handleLoadFromUrl = useCallback(async () => {
    const raw = String(sourceInput || '').trim();
    if (!raw) return;
    setError(null);
    setErrorDetail(null);

    let url = raw;
    const parsed = parseArxivId(raw);
    if (parsed) {
      url = `https://export.arxiv.org/pdf/${encodeURIComponent(parsed.canonical)}.pdf`;
    } else if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    try {
      setIsLoadingPdf(true);
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        setError('load-unsupported');
        return;
      }
      const displayName = parsed
        ? `arXiv:${parsed.canonical}`
        : decodeURIComponent(parsedUrl.pathname.split('/').pop() || '').trim() || parsedUrl.hostname;
      const host = parsedUrl.hostname.toLowerCase();
      const isAllowed = host === 'export.arxiv.org' || host === 'arxiv.org';
      if (!isAllowed) {
        setError('load-unsupported');
        setErrorDetail('Only arXiv links are supported right now.');
        return;
      }

      const proxyUrl = `/api/paper/fetch?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const json = await resp.json().catch(() => null);
          const msg = json?.error ? String(json.error) : `Failed to fetch PDF (${resp.status}).`;
          throw new Error(msg);
        }
        throw new Error(`Failed to fetch PDF (${resp.status}).`);
      }
      const bytes = await resp.arrayBuffer();
      await loadPdfFromBytes(bytes);
      setSourceName(displayName);
    } catch (e: any) {
      setError('load');
      setErrorDetail(String(e?.message || e || 'Failed to fetch PDF.'));
    } finally {
      setIsLoadingPdf(false);
    }
  }, [sourceInput, loadPdfFromBytes]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return;
      const name = String(file.name || '').trim();
      const lower = name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
      const isTex = lower.endsWith('.tex') || file.type.startsWith('text/');

      if (isPdf) {
        setError(null);
        setErrorDetail(null);
        setLatex('');
        setSelection(null);
        setIsLoadingPdf(true);
        try {
          const bytes = await file.arrayBuffer();
          await loadPdfFromBytes(bytes);
          setSourceName(name || 'PDF');
        } catch (e: any) {
          setError('load');
          setErrorDetail(String(e?.message || e || 'Failed to load PDF.'));
        } finally {
          setIsLoadingPdf(false);
        }
        return;
      }

      if (isTex) {
        if (!onImportTex) return;
        try {
          await onImportTex(file);
        } catch (e: any) {
          setError('import');
          setErrorDetail(String(e?.message || e || 'Failed to import file.'));
        }
        return;
      }

      setError('load-unsupported');
      setErrorDetail('Unsupported file type.');
    },
    [loadPdfFromBytes, onImportTex],
  );

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    const renderAll = async () => {
      setIsRenderingPage(true);
      setError(null);

      try {
        const total = pdfDoc.numPages || 0;
        const sizes: { width: number; height: number }[] = new Array(total);
        const outputScale = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;

        for (let i = 1; i <= total; i++) {
          if (cancelled) return;
          const canvas = canvasRefs.current[i - 1];
          if (!canvas) continue;

          const page = await pdfDoc.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: renderScale });

          const width = Math.floor(viewport.width);
          const height = Math.floor(viewport.height);
          const pixelWidth = Math.floor(width * outputScale);
          const pixelHeight = Math.floor(height * outputScale);

          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
          await page.render({ canvasContext: ctx, viewport, transform }).promise;
          if (cancelled) return;

          sizes[i - 1] = { width, height };
        }

        setPageSizes(sizes);
      } catch {
        if (!cancelled) {
          setError('render');
        }
      } finally {
        if (!cancelled) setIsRenderingPage(false);
      }
    };

    renderAll();
    setSelection(null);

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, renderScale, numPages]);

  const onPointerDown = useCallback((pageIndex: number) => {
    return (e: PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const y = clamp(e.clientY - rect.top, 0, rect.height);
      dragStartRef.current = { pageIndex, x, y };
      setSelection({ pageIndex, x, y, width: 0, height: 0 });
      e.currentTarget.setPointerCapture(e.pointerId);
    };
  }, []);

  const onPointerMove = useCallback((pageIndex: number) => {
    return (e: PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current || dragStartRef.current.pageIndex !== pageIndex) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const y = clamp(e.clientY - rect.top, 0, rect.height);
      const start = dragStartRef.current;
      const left = Math.min(start.x, x);
      const top = Math.min(start.y, y);
      const width = Math.abs(x - start.x);
      const height = Math.abs(y - start.y);
      setSelection({ pageIndex, x: left, y: top, width, height });
    };
  }, []);

  const onPointerUp = useCallback((pageIndex: number) => {
    return (e: PointerEvent<HTMLDivElement>) => {
      if (dragStartRef.current?.pageIndex !== pageIndex) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        return;
      }
      dragStartRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      setSelection((prev) => {
        if (!prev) return null;
        if (prev.width < MIN_SELECTION || prev.height < MIN_SELECTION) return null;
        return prev;
      });
    };
  }, []);

  const getSelectionDataUrl = useCallback(() => {
    if (!selection) return null;
    const canvas = canvasRefs.current[selection.pageIndex];
    const size = pageSizes[selection.pageIndex];
    if (!canvas || !size) return null;
    const normalized = normalizeRect(selection, size.width, size.height);
    if (normalized.width < MIN_SELECTION || normalized.height < MIN_SELECTION) return null;

    const scaleX = canvas.width / size.width;
    const scaleY = canvas.height / size.height;

    const sx = Math.round(normalized.x * scaleX);
    const sy = Math.round(normalized.y * scaleY);
    const sw = Math.max(1, Math.round(normalized.width * scaleX));
    const sh = Math.max(1, Math.round(normalized.height * scaleY));

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;

    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return out.toDataURL('image/png');
  }, [selection, pageSizes]);

  const handleExtractLatex = useCallback(async () => {
    if (isExtracting) return;
    const dataUrl = getSelectionDataUrl();
    if (!dataUrl) {
      setError('select');
      setErrorDetail(null);
      return;
    }

    setIsExtracting(true);
    setError(null);
    setErrorDetail(null);
    const controller = new AbortController();
    extractAbortRef.current = controller;

    try {
      const resp = await fetch('/api/paper/extract-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
        signal: controller.signal,
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || 'Failed to extract LaTeX.');
      }
      setLatex(String(json.latex || '').trim());
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // user cancelled
        return;
      }
      setError('extract');
      setErrorDetail(String(e?.message || e || 'Failed to extract LaTeX.'));
    } finally {
      setIsExtracting(false);
      extractAbortRef.current = null;
    }
  }, [getSelectionDataUrl, isExtracting]);

  const handleCancelExtract = useCallback(() => {
    extractAbortRef.current?.abort();
    extractAbortRef.current = null;
    setIsExtracting(false);
  }, []);

  const handleAddToWorkspace = useCallback(() => {
    const chunk = String(latex || '').trim();
    if (!chunk) return;
    onAddToWorkspace(chunk, sourceName.trim() || undefined);
    setLatex('');
    setSelection(null);
  }, [latex, onAddToWorkspace, sourceName]);

  const selectionStyle = useMemo(() => {
    if (!selection) return null;
    return {
      left: `${selection.x}px`,
      top: `${selection.y}px`,
      width: `${selection.width}px`,
      height: `${selection.height}px`,
    };
  }, [selection]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col gap-4',
          pdfDoc ? 'w-[95vw] max-w-[1100px] h-[85vh]' : 'w-[92vw] max-w-[560px]',
        )}
      >
        <DialogHeader>
          <DialogTitle>Add to Workspace</DialogTitle>
          <DialogDescription>Import full LaTeX files or extract snippets from PDFs.</DialogDescription>
        </DialogHeader>

        <div
          className="space-y-2"
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer?.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.tex,text/plain,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (fileInputRef.current) fileInputRef.current.value = '';
              void handleFile(file);
            }}
          />
          <div className="flex gap-2">
            <Input
              id="ask-paper-url"
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLoadFromUrl();
              }}
              placeholder="Paste link or drop a file"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => {
                if (sourceInput.trim()) {
                  handleLoadFromUrl();
                } else {
                  fileInputRef.current?.click();
                }
              }}
              disabled={isLoadingPdf}
              aria-label={sourceInput.trim() ? 'Load link' : 'Upload file'}
              title={sourceInput.trim() ? 'Load link' : 'Upload file'}
            >
              {isLoadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {pdfDoc ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div className="flex flex-col min-h-0 gap-2">
              <div className="flex-1 min-h-0 rounded-md border bg-muted/30 overflow-auto">
                <div className="flex flex-col items-center gap-6 p-3">
                  {Array.from({ length: numPages || 0 }).map((_, idx) => (
                    <div
                      key={`pdf-page-${idx}`}
                      className="relative inline-block group"
                      style={{
                        width: pageSizes[idx]?.width ?? 'auto',
                        height: pageSizes[idx]?.height ?? 'auto',
                      }}
                    >
                    <canvas ref={(el) => (canvasRefs.current[idx] = el)} />
                    <div
                      className={cn(
                        'absolute inset-0',
                          pageSizes[idx] ? 'cursor-crosshair' : 'cursor-default',
                          isRenderingPage ? 'pointer-events-none' : 'pointer-events-auto',
                        )}
                        onPointerDown={onPointerDown(idx)}
                        onPointerMove={onPointerMove(idx)}
                        onPointerUp={onPointerUp(idx)}
                      >
                        {selection && selection.pageIndex === idx && selectionStyle && (
                          <div
                            className="absolute border-2 border-primary/80 bg-primary/20"
                            style={selectionStyle}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col min-h-0 gap-3">
              <div className="relative flex-1 min-h-0 rounded-md border bg-background">
                {!latex.trim() && !isExtracting ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleExtractLatex}
                    disabled={!pdfDoc || !canExtract}
                    className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                  >
                    Extract
                  </Button>
                ) : null}
                {isExtracting ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelExtract}
                    className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                  >
                    Cancel
                  </Button>
                ) : null}
                <textarea
                  id="ask-paper-latex"
                  value={latex}
                  onChange={(e) => setLatex(e.target.value)}
                  placeholder="LaTeX will appear here after extraction."
                  readOnly={isExtracting}
                  className="h-full w-full resize-none border-0 bg-transparent p-3 pt-11 font-mono text-xs leading-relaxed outline-none"
                />
                {isExtracting && !latex.trim() ? (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 mt-10 -translate-x-1/2 text-sm text-muted-foreground">
                    Extracting…
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {error && (
          <div className="text-sm text-destructive">
            {error === 'select' && 'Select a region on the PDF to extract.'}
            {error === 'load' && 'Could not load that PDF. Double-check the link and try again.'}
            {error === 'load-unsupported' && 'Unsupported link or file type.'}
            {error === 'render' && 'PDF renderer failed to initialize. Please retry loading the PDF.'}
            {error === 'extract' && 'Could not extract LaTeX from that region. Try a smaller selection.'}
            {error === 'import' && 'Could not import that file. Try a different file.'}
            {errorDetail ? (
              <div className="mt-1 text-xs text-muted-foreground">{errorDetail}</div>
            ) : null}
          </div>
        )}

        {pdfDoc && latex.trim() ? (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" onClick={handleAddToWorkspace} disabled={!latex.trim()}>
              Add to Workspace
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
