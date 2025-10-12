'use client';

import { CheckCircle2, Rocket, Puzzle, Lightbulb, Sigma, Save, X, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { KatexRenderer } from './katex-renderer';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { SelectionToolbar } from './selection-toolbar';
import type React from 'react';

interface SublemmaItemProps {
  step: number;
  title: string;
  statement: string;
  proof: string;
  onStatementChange: (newStatement: string) => void;
  onProofChange: (newProof: string) => void;
  onTitleChange: (newTitle: string) => void;
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

export function SublemmaItem({ step, title, statement, proof, onStatementChange, onProofChange, onTitleChange }: SublemmaItemProps) {
  const { Icon, bg, text } = icons[(step - 1) % icons.length];
  const [isEditing, setIsEditing] = useState(false);
  const [editedStatement, setEditedStatement] = useState(statement);
  const [editedProof, setEditedProof] = useState(proof);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const contentRef = useRef<HTMLDivElement>(null);

  const [selection, setSelection] = useState<{ text: string, target: HTMLElement | null }>({ text: '', target: null });

  const handleMouseUp = useCallback(() => {
    if (isEditing) return;
    const currentSelection = window.getSelection();
    const selectedText = currentSelection?.toString().trim();

    if (currentSelection && selectedText && contentRef.current?.contains(currentSelection.anchorNode)) {
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

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditedStatement(statement);
    setEditedProof(proof);
  };

  const handleSave = () => {
    onStatementChange(editedStatement);
    onProofChange(editedProof);
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
      onTitleChange(trimmed);
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

  const toggleProofCollapsed = () => setIsProofCollapsed(v => !v);

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
      <AccordionItem value={`item-${step}`} className="bg-card border-gray-200 rounded-xl shadow-sm overflow-hidden border">
        <AccordionTrigger className="flex items-center justify-between w-full p-5 cursor-pointer hover:bg-muted/50 hover:no-underline">
          <div className="flex items-center gap-4">
            <span className={`p-2 rounded-full ${bg}`}>
              <Icon className={`h-5 w-5 ${text}`} />
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              {isTitleEditing ? (
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={commitTitle}
                  autoFocus
                  className="h-8 text-base font-medium font-headline"
                />
              ) : (
                <span
                  className="text-base font-medium text-gray-900 font-headline"
                  onDoubleClick={handleTitleDoubleClick}
                  title="Double-click to rename"
                >
                  {title}
                </span>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-5 pt-0 border-t">
          <div className="py-4">
            {isEditing ? (
              <div className="space-y-6">
                <div>
                  <div className="text-sm font-semibold mb-2">Statement</div>
                  <Textarea
                    value={editedStatement}
                    onChange={(e) => setEditedStatement(e.target.value)}
                    className="w-full h-28 text-base"
                    autoFocus
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold mb-2">Proof</div>
                  <Textarea
                    value={editedProof}
                    onChange={(e) => setEditedProof(e.target.value)}
                    className="w-full h-40 text-base"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={handleCancel}><X className="mr-2" />Cancel</Button>
                  <Button onClick={handleSave}><Save className="mr-2" />Save</Button>
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
                      {copiedStatement ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span className="sr-only">Copy Statement</span>
                    </button>
                  </div>
                  <KatexRenderer content={statement} />
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
                      {isProofCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      <span>Proof</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(proof, 'proof')}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-label="Copy Proof LaTeX"
                      title="Copy LaTeX"
                    >
                      {copiedProof ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span className="sr-only">Copy Proof</span>
                    </button>
                  </div>
                  {!isProofCollapsed && <KatexRenderer content={proof} />}
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );
}
