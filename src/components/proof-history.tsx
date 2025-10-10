'use client';

import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { PanelLeftClose, Undo2, CheckCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { useAppStore } from '@/state/app-store';
import { generateProofGraphAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

export function ProofHistory() {
  const { toast } = useToast();

  const {
    proofHistory,
    activeVersionIndex,
  } = useAppStore((s) => ({
    proofHistory: s.proofHistory,
    activeVersionIndex: s.activeVersionIndex,
  }));

  const setIsHistoryOpen = useAppStore((s) => s.setIsHistoryOpen);
  const setSublemmas = useAppStore((s) => s.setSublemmas);
  const setActiveVersionIndex = useAppStore((s) => s.setActiveVersionIndex);
  const setIsProofEdited = useAppStore((s) => s.setIsProofEdited);
  const setProofValidationResult = useAppStore((s) => s.setProofValidationResult);
  const setGraphData = useAppStore((s) => s.setGraphData);

  const reversedHistory = [...proofHistory].reverse();
  const reversedActiveIndex = proofHistory.length - 1 - activeVersionIndex;

  const handleClose = () => setIsHistoryOpen(false);

  const restoreVersion = async (index: number) => {
    const versionToRestore = proofHistory[index];
    if (!versionToRestore) return;

    // Update proof state
    setSublemmas(versionToRestore.sublemmas);
    setActiveVersionIndex(index);
    setIsProofEdited(true);
    setProofValidationResult(null);

    toast({
      title: 'Proof Restored',
      description: `Restored version from ${versionToRestore.timestamp.toLocaleTimeString()}`,
    });
    setGraphData(null)
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="text-lg font-semibold font-headline">Proof History</h3>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <PanelLeftClose />
          <span className="sr-only">Close History</span>
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {proofHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-4">No history yet.</p>
          ) : (
            reversedHistory.map((version, index) => {
              const originalIndex = proofHistory.length - 1 - index;
              const isActive = index === reversedActiveIndex;
              return (
                <Card
                  key={originalIndex}
                  className={cn(
                    'group hover:bg-muted/50 transition-colors',
                    isActive && 'bg-primary/10 border-primary'
                  )}
                >
                  <CardContent className='p-3'>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {version.isValid === true && (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        )}
                        {version.isValid === false && (
                          <CheckCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">Version {proofHistory.length - index}</p>
                          <p className="text-xs text-muted-foreground">
                            {version.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        {isActive && <Badge variant="secondary" className="text-xs">Current</Badge>}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => restoreVersion(originalIndex)}
                          className={cn('opacity-0 group-hover:opacity-100 transition-opacity', isActive && 'opacity-100')}
                          disabled={isActive}
                        >
                          <Undo2 className="mr-2 h-4 w-4" />
                          Restore
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
