import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { validateStatementAction } from '@/app/actions';
import { useAppStore } from '@/state/app-store';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KatexRenderer } from '@/components/katex-renderer';
import { useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';

function EditableProblemCard() {
  const problem = useAppStore((s) => s.problem!);
  const startProof = useAppStore((s) => s.startProof);

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(problem || '');
  const [isValidatingProblem, startValidateProblem] = useTransition();

  const [editError, setEditError] = useState<string | null>(null);

  const { toast } = useToast();

  const submit = () => {
    if (isValidatingProblem) return;
    startValidateProblem(async () => {
      setEditError(null);
      const trimmed = value.trim();
      if (!trimmed) {
        setEditError('Please enter a problem to solve.');
        return;
      }
      const result = await validateStatementAction(trimmed);
      if ('validity' in result && result.validity === 'VALID') {
        setIsEditing(false);
        await startProof(trimmed);
      } else if ('validity' in result) {
        setEditError('Looks like that’s not math! This app only works with math problems.');
      } else {
        const errorMessage =
          result.error || 'An unexpected error occurred while validating the problem.';
        setEditError(errorMessage);
        toast({
          title: 'Validation Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    });
  };

  const cancel = () => {
    setIsEditing(false);
    setValue(problem);
    setEditError(null);
  };

  return (
    <Card className="mb-1">
      <CardContent className="pt-6">
        {isEditing ? (
          <div>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                } else if (e.key === 'Escape') {
                  cancel();
                }
              }}
              autoFocus
              rows={3}
              className="w-full"
              disabled={isValidatingProblem}
            />
            {isValidatingProblem ? (
              <div className="flex items-center text-sm text-muted-foreground mt-2">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                Validating...
              </div>
            ) : (
              <div className="text-sm text-muted-foreground mt-2">
                Press Enter to submit, Shift+Enter for newline, Esc to cancel.
              </div>
            )}
            {editError && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div
            onDoubleClick={() => {
              setValue(problem);
              setIsEditing(true);
            }}
            style={{ cursor: 'pointer' }}
          >
            <KatexRenderer content={problem} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EditableProblemCard;
