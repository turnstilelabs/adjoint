'use client';
import { Check, Edit } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverAnchor } from './ui/popover';
import { useToast } from '@/hooks/use-toast';
import { validateStatementAction } from '@/app/actions';
import { useTransition } from 'react';

interface SelectionToolbarProps {
  target: HTMLElement | null;
  onRevise: () => void;
  selectedText: string;
}

export function SelectionToolbar({ target, onRevise, selectedText }: SelectionToolbarProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleCheckAgain = () => {
    startTransition(async () => {
      const result = await validateStatementAction(selectedText);
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
        toast({
          title: 'Error',
          description: result.error || 'Failed to verify selection.',
          variant: 'destructive',
        });
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
            <Check className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRevise} title="Revise statement">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
