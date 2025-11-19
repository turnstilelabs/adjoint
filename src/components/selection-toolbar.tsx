'use client';
import { HelpCircle, Edit } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverAnchor } from './ui/popover';
import { useToast } from '@/hooks/use-toast';
import { validateStatementAction } from '@/app/actions';
import { useTransition } from 'react';
import { useAppStore } from '@/state/app-store';
import { showModelError } from '@/lib/model-errors';

interface SelectionToolbarProps {
  target: HTMLElement | null;
  onRevise: () => void;
  selectedText: string;
}

export function SelectionToolbar({ target, onRevise, selectedText }: SelectionToolbarProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const goBack = useAppStore((s) => s.goBack);

  const handleCheckAgain = () => {
    startTransition(async () => {
      console.debug('[UI][SelectionToolbar] validate again len=', selectedText.length);
      const result = await validateStatementAction(selectedText);
      console.debug('[UI][SelectionToolbar] validation result success=', (result as any)?.success, 'validity=', (result as any)?.validity);
      if (result.success) {
        const r = result as {
          success: true;
          validity: 'VALID' | 'INVALID' | 'INCOMPLETE';
          reasoning: string;
        };
        let title = 'Verification Result';
        let description = r.reasoning || 'No reason provided.';
        if (r.validity === 'VALID') {
          title = 'Valid Statement';
          description = `The AI confirmed: "${r.reasoning}"`;
        } else if (r.validity === 'INVALID') {
          title = 'Invalid Statement';
          description = `The AI responded: "${r.reasoning}"`;
        } else if (r.validity === 'INCOMPLETE') {
          title = 'Incomplete Statement';
          description = `The AI responded: "${r.reasoning}"`;
        }
        toast({
          title: title,
          description: description,
          variant: r.validity === 'VALID' ? 'default' : 'destructive',
        });
      } else {
        const fallback =
          'Adjoint’s connection to the model was interrupted, please go back and retry.';
        const code = showModelError(toast, (result as any).error, goBack, 'Error');
        if (!code) {
          toast({
            title: 'Error',
            description: fallback,
            variant: 'destructive',
          });
        }
      }
    });
  };

  return (
    <Popover open={!!target}>
      <PopoverAnchor asChild>
        <div
          style={{
            position: 'absolute',
            top: target?.getBoundingClientRect().top
              ? target?.getBoundingClientRect().top + window.scrollY
              : 0,
            left: target?.getBoundingClientRect().left
              ? target?.getBoundingClientRect().left + window.scrollX
              : 0,
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={{
          top: '-12px',
        }}
      >
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCheckAgain}
            disabled={isPending}
            title="Check again"
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
