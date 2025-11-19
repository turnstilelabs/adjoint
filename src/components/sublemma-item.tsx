'use client';

import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Lightbulb,
  Puzzle,
  Rocket,
  Save,
  Sigma,
  X,
} from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { KatexRenderer } from './katex-renderer';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { SelectionToolbar } from './selection-toolbar';

interface SublemmaItemProps {
  step: number;
  title: string;
  statement: string;
  proof: string;
  onChange: (updates: { statement?: string; title?: string; proof?: string }) => void;
}

const icons = [
  { Icon: Sigma, bg: 'bg-blue-100', text: 'text-blue-600' },
  { Icon: Sigma, bg: 'bg-blue-100', text: 'text-blue-600' },
  { Icon: CheckCircle2, bg: 'bg-green-100', text: 'text-green-600' },
  { Icon: Rocket, bg: 'bg-purple-100', text: 'text-purple-600' },
  { Icon: Puzzle, bg: 'bg-orange-100', text: 'text-orange-600' },
  { Icon: Puzzle, bg: 'bg-orange-100', text: 'text-orange-600' },
  { Icon: Lightbulb, bg: 'bg-indigo-100', text: 'text-indigo-600' },
];

export function SublemmaItem({ step, title, statement, proof, onChange }: SublemmaItemProps) {
  const { Icon, bg, text } = icons[(step - 1) % icons.length];
  const [isEditing, setIsEditing] = useState(false);
  const [editedStatement, setEditedStatement] = useState(statement);
  const [editedProof, setEditedProof] = useState(proof);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const contentRef = useRef<HTMLDivElement>(null);
  const statementViewRef = useRef<HTMLDivElement>(null);
  const proofViewRef = useRef<HTMLDivElement>(null);
  const statementTextareaRef = useRef<HTMLTextAreaElement>(null);
  const proofTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editContainerRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<null | {
    target: 'statement' | 'proof';
    visibleAllNorm: string;
    prefixNorm: string;
    selectedNorm: string;
    yRatio?: number;
  }>(null);

  const [selection, setSelection] = useState<{
    text: string;
    target: HTMLElement | null;
  }>({ text: '', target: null });

  const handleMouseUp = useCallback(() => {
    if (isEditing) return;
    const currentSelection = window.getSelection();
    const selectedText = currentSelection?.toString().trim();

    if (
      currentSelection &&
      selectedText &&
      contentRef.current?.contains(currentSelection.anchorNode)
    ) {
      const range = currentSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const tempEl = document.createElement('span');
      // Position the anchor at the start of selection
      tempEl.style.position = 'absolute';
      tempEl.style.left = `${rect.left + window.scrollX}px`;
      tempEl.style.top = `${rect.top + window.scrollY}px`;
      document.body.appendChild(tempEl);
      setSelection({ text: selectedText, target: tempEl });

      // Cleanup the temporary element
      setTimeout(() => {
        if (document.body.contains(tempEl)) {
          document.body.removeChild(tempEl);
        }
      }, 0);
    } else {
      setSelection({ text: '', target: null });
    }
  }, [isEditing]);

  const normalizeVisibleToLatex = (txt: string) =>
    txt
      .replace(/≥/g, '\\ge ')
      .replace(/≤/g, '\\le ')
      .replace(/∑/g, '\\sum ')
      .replace(/[–−]/g, '-')
      .replace(/\u00A0/g, ' ')
      // common smart quotes to plain
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'")
      .trim();

  const placeCaret = (ta: HTMLTextAreaElement, idx: number) => {
    try {
      ta.focus();
      const pos = Math.max(0, Math.min(idx, ta.value.length));
      ta.setSelectionRange(pos, pos);
      ta.scrollTop = ta.scrollHeight * (pos / Math.max(1, ta.value.length));
    } catch {
      // ignore
    }
  };

  // Compute a caret index in the source string by aligning the clicked position
  // within the rendered container with the same occurrence number in the source.
  const computeCaretIndexFromSelection = (
    containerEl: HTMLElement,
    source: string,
    selectedText: string,
  ): number => {
    try {
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode) return 0;

      // Measure prefix up to the clicked position
      const range = document.createRange();
      range.setStart(containerEl, 0);
      range.setEnd(sel.anchorNode, sel.anchorOffset);

      const visibleAllRaw = (containerEl.textContent || '').toString();
      const visibleAllNorm = normalizeVisibleToLatex(visibleAllRaw);
      const prefixRaw = range.toString();
      const prefixNorm = normalizeVisibleToLatex(prefixRaw);
      const selectedNorm = normalizeVisibleToLatex(selectedText || '');

      // If no selected text (rare on double click), approximate by normalized ratio
      if (!selectedNorm) {
        const approx = Math.round(
          (prefixNorm.length / Math.max(1, visibleAllNorm.length)) * source.length,
        );
        return Math.max(0, Math.min(approx, source.length));
      }

      // Build small context windows around the click in the normalized visible text
      const ctxLen = 12;
      const leftCtxVis = prefixNorm.slice(
        Math.max(0, prefixNorm.length - ctxLen),
        prefixNorm.length,
      );
      const afterStart = prefixNorm.length + selectedNorm.length;
      const rightCtxVis = visibleAllNorm.slice(afterStart, afterStart + ctxLen);

      // Determine which occurrence of the selected text was clicked in the visible content
      const occVis: number[] = [];
      {
        let vIdx = 0;
        while (true) {
          const f = visibleAllNorm.indexOf(selectedNorm, vIdx);
          if (f < 0) break;
          occVis.push(f);
          vIdx = f + Math.max(1, selectedNorm.length);
        }
      }
      let occNumber = 0;
      for (let i = 0; i < occVis.length; i++) {
        if (occVis[i] <= prefixNorm.length) occNumber = i;
        else break;
      }

      // Helper scoring
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

      // Collect candidate indices in the raw source for the selected substring
      const candidates: number[] = [];
      let pos = 0;
      while (true) {
        const f = source.indexOf(selectedNorm, pos);
        if (f < 0) break;
        candidates.push(f);
        pos = f + Math.max(1, selectedNorm.length);
      }

      // If no exact candidates, try ignoring whitespace differences
      if (candidates.length === 0) {
        const needleNS = selectedNorm.replace(/\s+/g, '');
        if (needleNS) {
          const sourceNS = source.replace(/\s+/g, '');
          let p = 0;
          while (true) {
            const f = sourceNS.indexOf(needleNS, p);
            if (f < 0) break;
            // Map no-space index back to raw source index
            let rawIdx = 0;
            let nsCount = 0;
            for (let i = 0; i < source.length; i++) {
              if (source[i] !== ' ') {
                if (nsCount === f) {
                  rawIdx = i;
                  break;
                }
                nsCount++;
              }
            }
            candidates.push(rawIdx);
            p = f + Math.max(1, needleNS.length);
          }
        }
      }

      // Map by occurrence number first (prefer exact ordinal mapping to avoid picking the first match)
      if (candidates.length > 0 && occVis.length > 0) {
        const mappedByOrd = candidates[Math.min(occNumber, candidates.length - 1)];
        return mappedByOrd;
      }

      // Fallback: ratio if still no candidates
      if (candidates.length === 0) {
        const approx = Math.round(
          (prefixNorm.length / Math.max(1, visibleAllNorm.length)) * source.length,
        );
        return Math.max(0, Math.min(approx, source.length));
      }

      // Choose candidate that best matches left/right context and is closest to approximate position
      const approxIdx = Math.round(
        (prefixNorm.length / Math.max(1, visibleAllNorm.length)) * source.length,
      );

      let bestIdx = candidates[0];
      let bestScore = -1;
      let bestDist = Number.MAX_SAFE_INTEGER;

      for (const idx of candidates) {
        const leftSrcNorm = normalizeVisibleToLatex(
          source.slice(Math.max(0, idx - ctxLen * 2), idx),
        );
        const rightSrcNorm = normalizeVisibleToLatex(
          source.slice(idx + selectedNorm.length, idx + selectedNorm.length + ctxLen * 2),
        );
        const l = commonSuffixLen(leftSrcNorm, leftCtxVis);
        const r = commonPrefixLen(rightSrcNorm, rightCtxVis);
        const score = l + r;
        const dist = Math.abs(idx - approxIdx);

        if (score > bestScore || (score === bestScore && dist < bestDist)) {
          bestScore = score;
          bestDist = dist;
          bestIdx = idx;
        }
      }

      return bestIdx;
    } catch {
      return 0;
    }
  };

  // Compute caret index using a snapshot captured BEFORE switching to edit mode.
  const computeCaretIndexFromSnapshot = (
    source: string,
    snap: { visibleAllNorm: string; prefixNorm: string; selectedNorm: string; yRatio?: number },
  ): number => {
    const { visibleAllNorm, prefixNorm, selectedNorm, yRatio } = snap;

    // No selected substring: approximate by normalized ratio
    if (!selectedNorm) {
      // Prefer vertical position heuristic if available, else normalized text ratio
      if (typeof yRatio === 'number' && Number.isFinite(yRatio)) {
        const approxY = Math.round(Math.max(0, Math.min(1, yRatio)) * source.length);
        return Math.max(0, Math.min(approxY, source.length));
      }
      const approx = Math.round(
        (prefixNorm.length / Math.max(1, visibleAllNorm.length)) * source.length,
      );
      return Math.max(0, Math.min(approx, source.length));
    }

    // Determine which occurrence of the selected text was clicked in the visible content
    const occVis: number[] = [];
    {
      let vIdx = 0;
      while (true) {
        const f = visibleAllNorm.indexOf(selectedNorm, vIdx);
        if (f < 0) break;
        occVis.push(f);
        vIdx = f + Math.max(1, selectedNorm.length);
      }
    }
    let occNumber = 0;
    for (let i = 0; i < occVis.length; i++) {
      if (occVis[i] <= prefixNorm.length) occNumber = i;
      else break;
    }

    // Collect candidate indices in the raw source for the selected substring
    const candidates: number[] = [];
    let pos = 0;
    while (true) {
      const f = source.indexOf(selectedNorm, pos);
      if (f < 0) break;
      candidates.push(f);
      pos = f + Math.max(1, selectedNorm.length);
    }

    // If no exact candidates, try ignoring whitespace differences
    if (candidates.length === 0) {
      const needleNS = selectedNorm.replace(/\s+/g, '');
      if (needleNS) {
        const sourceNS = source.replace(/\s+/g, '');
        let p = 0;
        while (true) {
          const f = sourceNS.indexOf(needleNS, p);
          if (f < 0) break;
          // Map no-space index back to raw source index
          let rawIdx = 0;
          let nsCount = 0;
          for (let i = 0; i < source.length; i++) {
            if (source[i] !== ' ') {
              if (nsCount === f) {
                rawIdx = i;
                break;
              }
              nsCount++;
            }
          }
          candidates.push(rawIdx);
          p = f + Math.max(1, needleNS.length);
        }
      }
    }

    // Map by occurrence number first (prefer exact ordinal mapping)
    if (candidates.length > 0 && occVis.length > 0) {
      const mappedByOrd = candidates[Math.min(occNumber, candidates.length - 1)];
      return mappedByOrd;
    }

    // Fallback: ratio if still no candidates
    if (candidates.length === 0) {
      const approx = Math.round(
        (prefixNorm.length / Math.max(1, visibleAllNorm.length)) * source.length,
      );
      return Math.max(0, Math.min(approx, source.length));
    }

    // As tie-breaker, pick candidate closest to approximate position
    const approxIdx = Math.round(
      (prefixNorm.length / Math.max(1, visibleAllNorm.length)) * source.length,
    );
    let bestIdx = candidates[0];
    let bestDist = Number.MAX_SAFE_INTEGER;
    for (const idx of candidates) {
      const dist = Math.abs(idx - approxIdx);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }
    return bestIdx;
  };

  // Cross-browser: derive caret range from client point
  const getCaretRangeFromPoint = (x: number, y: number): Range | null => {
    const anyDoc = document as any;
    if (typeof anyDoc.caretRangeFromPoint === 'function') {
      return anyDoc.caretRangeFromPoint(x, y);
    }
    if (typeof anyDoc.caretPositionFromPoint === 'function') {
      const pos = anyDoc.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.setEnd(pos.offsetNode, pos.offset);
      return r;
    }
    return null;
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    // Determine which block was clicked using the event target
    const targetNode = e.target as Node | null;
    const inStatement =
      !!statementViewRef.current && !!targetNode && statementViewRef.current.contains(targetNode);
    const inProof =
      !!proofViewRef.current && !!targetNode && proofViewRef.current.contains(targetNode);

    const sel = window.getSelection();
    const selectedTextRaw = sel?.toString() || '';
    const selectedText = normalizeVisibleToLatex(selectedTextRaw);

    // Capture a snapshot BEFORE switching to edit mode (DOM will re-render afterwards).
    const containerEl = inStatement
      ? statementViewRef.current
      : inProof
        ? proofViewRef.current
        : null;

    if (containerEl) {
      try {
        const visibleAllRaw = (containerEl.textContent || '').toString();
        const visibleAllNorm = normalizeVisibleToLatex(visibleAllRaw);

        // Prefer caret position from click point for prefix measurement
        let prefixNorm = '';
        const clickRange = getCaretRangeFromPoint(e.clientX, e.clientY);
        if (clickRange && clickRange.endContainer) {
          const r = document.createRange();
          r.setStart(containerEl, 0);
          r.setEnd(clickRange.endContainer, clickRange.endOffset);
          prefixNorm = normalizeVisibleToLatex(r.toString());
        } else if (sel?.anchorNode) {
          const r = document.createRange();
          r.setStart(containerEl, 0);
          r.setEnd(sel.anchorNode, sel.anchorOffset);
          prefixNorm = normalizeVisibleToLatex(r.toString());
        }

        const selectedNorm = normalizeVisibleToLatex(selectedText || '');
        const rect = containerEl.getBoundingClientRect();
        const yRatio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : undefined;

        pendingFocusRef.current = {
          target: inStatement ? 'statement' : 'proof',
          visibleAllNorm,
          prefixNorm,
          selectedNorm,
          yRatio,
        };
      } catch {
        pendingFocusRef.current = null;
      }
    } else {
      pendingFocusRef.current = null;
    }

    setIsEditing(true);
    setEditedStatement(statement);
    setEditedProof(proof);

    requestAnimationFrame(() => {
      const snap = pendingFocusRef.current;
      pendingFocusRef.current = null;

      if (snap?.target === 'statement' && statementTextareaRef.current) {
        const idx = computeCaretIndexFromSnapshot(statement, snap);
        placeCaret(statementTextareaRef.current, idx);
      } else if (snap?.target === 'proof' && proofTextareaRef.current) {
        const idx = computeCaretIndexFromSnapshot(proof, snap);
        placeCaret(proofTextareaRef.current, idx);
      } else {
        if (statementTextareaRef.current) {
          placeCaret(statementTextareaRef.current, 0);
        }
      }
    });
  };

  const handleSave = () => {
    onChange({ statement: editedStatement, proof: editedProof });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedStatement(statement);
    setEditedProof(proof);
  };

  const handleReviseFromToolbar = () => {
    setIsEditing(true);
    // Default to editing the statement with the selected text; user can adjust.
    setEditedStatement(selection.text);
    setSelection({ text: '', target: null });
  };

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTitleEditing(true);
    setEditedTitle(title);
  };

  const commitTitle = () => {
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== title) {
      onChange({ title: trimmed });
    }
    setIsTitleEditing(false);
  };

  const cancelTitleEdit = () => {
    setIsTitleEditing(false);
    setEditedTitle(title);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelTitleEdit();
    }
  };

  // Copy to clipboard helpers and proof collapse state
  const [isProofCollapsed, setIsProofCollapsed] = useState(false);
  const [copiedStatement, setCopiedStatement] = useState(false);
  const [copiedProof, setCopiedProof] = useState(false);

  const handleCopy = async (value: string, which: 'statement' | 'proof') => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // no-op
      }
    }
    if (which === 'statement') {
      setCopiedStatement(true);
      setTimeout(() => setCopiedStatement(false), 1500);
    } else {
      setCopiedProof(true);
      setTimeout(() => setCopiedProof(false), 1500);
    }
  };

  const toggleProofCollapsed = () => setIsProofCollapsed((v) => !v);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  useEffect(() => {
    // When editing starts/stops, or content changes, clear selection
    setSelection({ text: '', target: null });
  }, [isEditing, statement, proof]);

  // Click outside to cancel edit only if there are no changes
  useEffect(() => {
    if (!isEditing) return;
    const onDown = (e: MouseEvent) => {
      if (!editContainerRef.current) return;
      const target = e.target as Node;
      if (!editContainerRef.current.contains(target)) {
        if (editedStatement === statement && editedProof === proof) {
          setIsEditing(false);
        }
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
    };
  }, [isEditing, editedStatement, editedProof, statement, proof]);

  useEffect(() => {
    setEditedTitle(title);
  }, [title]);

  return (
    <>
      {selection.target && (
        <SelectionToolbar
          target={selection.target}
          onRevise={handleReviseFromToolbar}
          selectedText={selection.text}
        />
      )}
      <AccordionItem
        value={`item-${step}`}
        className="bg-card border-border rounded-xl shadow-sm overflow-hidden border"
      >
        <AccordionTrigger className="flex items-center justify-between w-full p-5 cursor-pointer hover:bg-muted/50 hover:no-underline">
          <div className="flex items-center gap-4 grow">
            <span className={`p-2 rounded-full ${bg}`}>
              <Icon className={`h-5 w-5 ${text}`} />
            </span>
            <div className="grow pr-5 flex">
              {isTitleEditing ? (
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={commitTitle}
                  autoFocus
                  className="h-8 text-base font-medium font-headline w-full"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="text-base font-medium text-primary font-headline text-left w-auto"
                  onDoubleClick={handleTitleDoubleClick}
                  onClickCapture={(e) => e.stopPropagation()}
                  title="Double-click to rename"
                >
                  <KatexRenderer content={title} className="inline" autoWrap={false} />
                </div>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-5 pt-0 border-t">
          <div className="py-4">
            {isEditing ? (
              <div ref={editContainerRef} className="space-y-6">
                <div>
                  <div className="text-sm font-semibold mb-2">Statement</div>
                  <Textarea
                    ref={statementTextareaRef}
                    value={editedStatement}
                    onChange={(e) => setEditedStatement(e.target.value)}
                    className="w-full h-28 text-base"
                    autoFocus
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold mb-2">Proof</div>
                  <Textarea
                    ref={proofTextareaRef}
                    value={editedProof}
                    onChange={(e) => setEditedProof(e.target.value)}
                    className="w-full h-40 text-base"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={handleCancel}>
                    <X className="mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSave}>
                    <Save className="mr-2" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div ref={contentRef} onDoubleClick={handleDoubleClick} className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground mb-1">
                    <span>Statement</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(statement, 'statement')}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-label="Copy Statement LaTeX"
                      title="Copy LaTeX"
                    >
                      {copiedStatement ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">Copy Statement</span>
                    </button>
                  </div>
                  <div ref={statementViewRef} className="text-primary">
                    <KatexRenderer content={statement} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground mb-1">
                    <button
                      type="button"
                      onClick={toggleProofCollapsed}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      aria-label={isProofCollapsed ? 'Expand Proof' : 'Collapse Proof'}
                      title={isProofCollapsed ? 'Expand Proof' : 'Collapse Proof'}
                    >
                      {isProofCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      <span>Proof</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(proof, 'proof')}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-label="Copy Proof LaTeX"
                      title="Copy LaTeX"
                    >
                      {copiedProof ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">Copy Proof</span>
                    </button>
                  </div>
                  {!isProofCollapsed && (
                    <div ref={proofViewRef}>
                      <KatexRenderer content={proof} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );
}
