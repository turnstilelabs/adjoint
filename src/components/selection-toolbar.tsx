"use client";
import { HelpCircle, Edit, MessageSquareText, Copy } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverAnchor } from './ui/popover';
import { useToast } from '@/hooks/use-toast';
import { validateStatementAction, checkAgainProofAction } from '@/app/actions';
import { useTransition } from 'react';
import { useAppStore } from '@/state/app-store';
import { showModelError } from '@/lib/model-errors';
import { useRouter } from 'next/navigation';

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
}

export function SelectionToolbar({
  anchor,
  onRevise,
  selectedText,
  canCheckAgain = true,
  lemmaStatement,
  selectedHtml,
  showEditSelection = false,
  onEditSelection,
  showCopy = true,
  showAskAI = true,
  showCheckAgain = true,
  showRevise = true,
}: SelectionToolbarProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const goBack = useAppStore((s) => s.goBack);
  const view = useAppStore((s) => s.view);
  const setChatDraft = useAppStore((s) => s.setChatDraft);
  const setExploreDraft = useAppStore((s) => s.setExploreDraft);
  const startExplore = useAppStore((s) => s.startExplore);
  const router = useRouter();

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
          {showCopy && (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await copyWithFormat(selectedText, selectedHtml);
                toast({ title: 'Copied', description: 'Selection copied to clipboard.' });
              }}
              title="Copy"
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}

          {showAskAI && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const text = (selectedText || '').trim();
                if (!text) return;

                if (view === 'explore') {
                  setExploreDraft(text);
                  return;
                }

                if (view === 'proof') {
                  setChatDraft(text, { open: true });
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
          )}

          {showCheckAgain && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCheckAgain}
              disabled={isPending || !canCheckAgain}
              title={canCheckAgain ? 'Check again' : 'Check again (Proof only)'}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          )}

          {showEditSelection && onEditSelection ? (
            <Button variant="ghost" size="icon" onClick={onEditSelection} title="Edit">
              <Edit className="h-4 w-4" />
            </Button>
          ) : showRevise ? (
            <Button variant="ghost" size="icon" onClick={onRevise} title="Revise statement">
              <Edit className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
