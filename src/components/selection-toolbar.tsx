'use client';
import { HelpCircle, Edit } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverAnchor } from './ui/popover';
import { useToast } from '@/hooks/use-toast';
import { validateStatementAction, checkAgainProofAction } from '@/app/actions';
import { useTransition } from 'react';
import { useAppStore } from '@/state/app-store';
import { showModelError } from '@/lib/model-errors';

interface SelectionToolbarProps {
  anchor: { top: number; left: number } | null;
  onRevise: () => void;
  selectedText: string;
  canCheckAgain?: boolean;
  lemmaStatement?: string;
}

export function SelectionToolbar({
  anchor,
  onRevise,
  selectedText,
  canCheckAgain = true,
  lemmaStatement,
}: SelectionToolbarProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const goBack = useAppStore((s) => s.goBack);

  const handleCheckAgain = () => {
    const loadingToast = toast({
      title: 'Generating analysis…',
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
        const modelName = (result as any)?.model || 'model';
        const reasoning = r.reasoning || 'No reason provided.';
        let title: string;
        if (r.validity === 'VALID') {
          title = `Proof excerpt appears sound (${modelName})`;
        } else if (r.validity === 'INVALID') {
          title = `Proof excerpt likely incorrect (${modelName})`;
        } else {
          title = `Proof excerpt may need additional context (${modelName})`;
        }
        const description = reasoning;
        loadingToast.update({
          title: title,
          description: description,
          variant: r.validity === 'VALID' ? 'default' : 'destructive',
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
            variant: 'destructive',
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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCheckAgain}
            disabled={isPending || !canCheckAgain}
            title={canCheckAgain ? 'Check again' : 'Check again (Proof only)'}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRevise} title="Revise statement">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
