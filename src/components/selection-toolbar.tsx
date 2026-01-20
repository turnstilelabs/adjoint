"use client";
import { HelpCircle, Edit, MessageSquareText, Copy, Sparkles, CheckSquare } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverAnchor } from './ui/popover';
import { useToast } from '@/hooks/use-toast';
import { validateStatementAction, checkAgainProofAction } from '@/app/actions';
import { useTransition } from 'react';
import { useAppStore } from '@/state/app-store';
import { showModelError } from '@/lib/model-errors';
import { useRouter } from 'next/navigation';
import { selectionRangeToLatex } from '@/lib/selection-to-latex';

async function copyWithFormat(text: string, html?: string) {
  const t = String(text ?? '');
  if (!t) return;

  // Prefer writing HTML + plain text (keeps math formatting when pasted into rich editors).
  try {
    if (navigator.clipboard && 'write' in navigator.clipboard && typeof (window as any).ClipboardItem === 'function') {
      const safeHtml =
        typeof html === 'string' && html.trim().length > 0
          ? html
          : `<pre style="white-space:pre-wrap">${t
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</pre>`;
      const item = new (window as any).ClipboardItem({
        'text/plain': new Blob([t], { type: 'text/plain' }),
        'text/html': new Blob([safeHtml], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
      return;
    }
  } catch {
    // fall back
  }

  // Fallback: plain text
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      // ignore
    }
  }
}

interface SelectionToolbarProps {
  anchor: { top: number; left: number } | null;
  onRevise: () => void;
  selectedText: string;
  /** Optional override for Copy (e.g. LaTeX extracted from KaTeX). */
  copyText?: string;
  canCheckAgain?: boolean;
  lemmaStatement?: string;
  /** Optional HTML for rich copy (used by global selection overlay). */
  selectedHtml?: string;

  /** Whether to show the Raw-Proof-specific "Edit" action. */
  showEditSelection?: boolean;
  /** Optional handler to jump to the selected text in the raw proof editor. */
  onEditSelection?: () => void;

  /** Controls which buttons appear. */
  showCopy?: boolean;
  showAskAI?: boolean;
  showCheckAgain?: boolean;
  showRevise?: boolean;

  /** Optional "Prove this" action (Workspace selection -> send to prover). */
  showProveThis?: boolean;
  onProveThis?: () => void;

  /** Optional override for Ask AI behavior (e.g. Workspace selection -> open chat). */
  onAskAI?: () => void;

  /** Optional action for Workspace: add selection to Review by wrapping it in a theorem-like env. */
  showAddToReview?: boolean;
  onAddToReview?: (opts: { selectionText: string; selectionLatex: string }) => void;

  /**
   * Optional override for button order.
   *
   * Default preserves the existing order to avoid UI regressions in other screens.
   * Workspace can pass e.g. ['copy','addToReview','proveThis','askAI'].
   */
  buttonOrder?: Array<
    | 'addToReview'
    | 'copy'
    | 'askAI'
    | 'proveThis'
    | 'checkAgain'
    | 'editSelection'
    | 'revise'
  >;
}

export function SelectionToolbar({
  anchor,
  onRevise,
  selectedText,
  copyText,
  canCheckAgain = true,
  lemmaStatement,
  selectedHtml,
  showEditSelection = false,
  onEditSelection,
  showCopy = true,
  showAskAI = true,
  showCheckAgain = true,
  showRevise = true,
  showProveThis = false,
  onProveThis,
  onAskAI,
  showAddToReview = false,
  onAddToReview,
  buttonOrder,
}: SelectionToolbarProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const goBack = useAppStore((s) => s.goBack);
  const view = useAppStore((s) => s.view);
  const setChatDraft = useAppStore((s) => s.setChatDraft);
  const setExploreDraft = useAppStore((s) => s.setExploreDraft);
  const setWorkspaceDraft = useAppStore((s) => (s as any).setWorkspaceDraft);
  const setIsWorkspaceChatOpen = useAppStore((s) => (s as any).setIsWorkspaceChatOpen);
  const startExplore = useAppStore((s) => s.startExplore);
  const router = useRouter();

  const computeCopyTextFromLiveSelection = () => {
    try {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return '';
      const range = sel.getRangeAt(0);
      return selectionRangeToLatex(range);
    } catch {
      return '';
    }
  };

  const handleCheckAgain = () => {
    const loadingToast = toast({
      title: 'Sending for analysis…',
      description: 'Evaluating the selected proof excerpt',
      variant: 'default',
      duration: 2147483647,
    });
    startTransition(async () => {
      console.debug('[UI][SelectionToolbar] validate again len=', selectedText.length);
      const result =
        canCheckAgain && lemmaStatement
          ? await checkAgainProofAction(selectedText, lemmaStatement)
          : await validateStatementAction(selectedText);
      console.debug(
        '[UI][SelectionToolbar] validation result success=',
        (result as any)?.success,
        'validity=',
        (result as any)?.validity,
      );
      if ((result as any).success) {
        const r = result as {
          success: true;
          validity: 'VALID' | 'INVALID' | 'INCOMPLETE';
          reasoning: string;
        };
        const reasoning = r.reasoning || 'No reason provided.';
        let title: string;
        if (r.validity === 'VALID') {
          title = 'Excerpt appears valid';
        } else if (r.validity === 'INVALID') {
          title = 'Excerpt likely invalid';
        } else {
          title = 'Excerpt may need additional context';
        }
        const description = reasoning;
        loadingToast.update({
          title: title,
          description: description,
          variant: 'default',
          duration: 2147483647,
          open: true,
        });
      } else {
        const fallback =
          'Adjoint’s connection to the model was interrupted, please go back and retry.';
        const code = showModelError(toast, (result as any).error, goBack, 'Error');
        if (!code) {
          loadingToast.update({
            title: 'Error',
            description: fallback,
            variant: 'default',
            duration: 2147483647,
            open: true,
          });
        }
      }
    });
  };

  const defaultOrder: NonNullable<SelectionToolbarProps['buttonOrder']> = [
    'addToReview',
    'copy',
    'askAI',
    'proveThis',
    'checkAgain',
    'editSelection',
    'revise',
  ];

  const order = (() => {
    const requested = (buttonOrder ?? []).filter(Boolean);
    if (requested.length === 0) return defaultOrder;
    // Append any remaining known actions to ensure we don't accidentally hide buttons.
    const set = new Set(requested);
    return [...requested, ...defaultOrder.filter((k) => !set.has(k))];
  })();

  return (
    <Popover open={!!anchor}>
      <PopoverAnchor asChild>
        <div
          style={{
            position: 'fixed',
            top: anchor?.top ?? 0,
            left: anchor?.left ?? 0,
            width: 0,
            height: 0,
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        side="top"
        sideOffset={8}
        align="center"
      >
        <div className="flex items-center gap-1">
          {order.map((k) => {
            if (k === 'addToReview') {
              if (!showAddToReview || typeof onAddToReview !== 'function') return null;
              return (
                <Button
                  key={k}
                  variant="ghost"
                  size="icon"
                  // Prevent the click from collapsing the current selection before we read it.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const fromSelection = computeCopyTextFromLiveSelection();
                    const selectionLatex = (fromSelection || selectedText || '').trim();
                    const selectionTextPlain = (selectedText || '').trim();
                    if (!selectionLatex && !selectionTextPlain) return;
                    onAddToReview({ selectionText: selectionTextPlain, selectionLatex });
                  }}
                  title="Add to review"
                >
                  <CheckSquare className="h-4 w-4" />
                </Button>
              );
            }

            if (k === 'copy') {
              if (!showCopy) return null;
              return (
                <Button
                  key={k}
                  variant="ghost"
                  size="icon"
                  // Prevent the click from collapsing the current selection before we copy.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => {
                    const fromSelection = computeCopyTextFromLiveSelection();
                    const effective = (copyText ?? fromSelection ?? selectedText).trim();
                    await copyWithFormat(effective, selectedHtml);
                    toast({ title: 'Copied', description: 'Selection copied to clipboard.' });
                  }}
                  title="Copy"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              );
            }

            if (k === 'askAI') {
              if (!showAskAI) return null;
              return (
                <Button
                  key={k}
                  variant="ghost"
                  size="icon"
                  // Prevent the click from collapsing the current selection before we read it.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (typeof onAskAI === 'function') {
                      onAskAI();
                      return;
                    }

                    const fromSelection = computeCopyTextFromLiveSelection();
                    const text = (fromSelection || selectedText || '').trim();
                    if (!text) return;

                    if (view === 'explore') {
                      setExploreDraft(text);
                      return;
                    }

                    if (view === 'proof') {
                      setChatDraft(text, { open: true });
                      return;
                    }

                    if (view === 'workspace') {
                      try {
                        if (typeof setWorkspaceDraft === 'function') setWorkspaceDraft(text, { open: true });
                        if (typeof setIsWorkspaceChatOpen === 'function') setIsWorkspaceChatOpen(true);
                      } catch {
                        // ignore
                      }
                      return;
                    }

                    // Home (or unknown): send to Explore as a general "ask AI" context.
                    try {
                      startExplore(text);
                      router.push(`/explore?q=${encodeURIComponent(text)}`);
                      // Prefill the explore input too.
                      setExploreDraft(text);
                    } catch {
                      toast({
                        title: 'Ask AI unavailable',
                        description: 'Please open Explore or Proof mode first.',
                        variant: 'default',
                      });
                    }
                  }}
                  title="Ask AI"
                >
                  <MessageSquareText className="h-4 w-4" />
                </Button>
              );
            }

            if (k === 'proveThis') {
              if (!showProveThis || typeof onProveThis !== 'function') return null;
              return (
                <Button
                  key={k}
                  variant="ghost"
                  size="icon"
                  // Prevent the click from collapsing the current selection before we read it.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onProveThis()}
                  title="Prove this"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              );
            }

            if (k === 'checkAgain') {
              if (!showCheckAgain) return null;
              return (
                <Button
                  key={k}
                  variant="ghost"
                  size="icon"
                  onClick={handleCheckAgain}
                  disabled={isPending || !canCheckAgain}
                  title={canCheckAgain ? 'Check again' : 'Check again (Proof only)'}
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              );
            }

            if (k === 'editSelection') {
              if (!showEditSelection || !onEditSelection) return null;
              return (
                <Button key={k} variant="ghost" size="icon" onClick={onEditSelection} title="Edit">
                  <Edit className="h-4 w-4" />
                </Button>
              );
            }

            if (k === 'revise') {
              if (!showRevise) return null;
              return (
                <Button key={k} variant="ghost" size="icon" onClick={onRevise} title="Revise statement">
                  <Edit className="h-4 w-4" />
                </Button>
              );
            }

            return null;
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
