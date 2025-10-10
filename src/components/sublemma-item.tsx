'use client';

import { CheckCircle2, Rocket, Puzzle, Lightbulb, Sigma, Save, X } from 'lucide-react';
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
  content: string;
  onContentChange: (newContent: string) => void;
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

export function SublemmaItem({
  step,
  title,
  content,
  onContentChange,
  onTitleChange,
}: SublemmaItemProps) {
  const { Icon, bg, text } = icons[(step - 1) % icons.length];
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const contentRef = useRef<HTMLDivElement>(null);

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

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditedContent(content);
  };

  const handleSave = () => {
    onContentChange(editedContent);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedContent(content);
  };

  const handleReviseFromToolbar = () => {
    setIsEditing(true);
    setEditedContent(selection.text);
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

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  useEffect(() => {
    // When editing starts/stops, or content changes, clear selection
    setSelection({ text: '', target: null });
  }, [isEditing, content]);

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
        className="bg-card border-gray-200 rounded-xl shadow-sm overflow-hidden border"
      >
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
              <div className="space-y-4">
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full h-32 text-base"
                  autoFocus
                />
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
              <div ref={contentRef} onDoubleClick={handleDoubleClick}>
                <KatexRenderer content={content} />
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );
}
