'use client';

import { useMemo, useState } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { CheckCircle, PanelLeftClose, Trash2, Undo2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/state/app-store';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Group = {
  baseMajor: number;
  raw: { id: string; originalIndex: number } | null;
  structured: { id: string; originalIndex: number }[];
};

export function ProofHistory() {
  const { toast } = useToast();

  const { proofHistory, activeVersionIndex } = useAppStore((s) => ({
    proofHistory: s.proofHistory,
    activeVersionIndex: s.activeVersionIdx,
  }));

  const setIsHistoryOpen = useAppStore((s) => s.setIsHistoryOpen);
  const setActiveVersionIndex = useAppStore((s) => s.setActiveVersionIndex);
  const deleteProofVersion = useAppStore((s) => s.deleteProofVersion);

  const [confirm, setConfirm] = useState<
    | null
    | {
      id: string;
      title: string;
      description: string;
    }
  >(null);

  const groups = useMemo<Group[]>(() => {
    const byMajor = new Map<number, Group>();

    proofHistory.forEach((v, originalIndex) => {
      const baseMajor = v.baseMajor;
      const g =
        byMajor.get(baseMajor) ??
        ({ baseMajor, raw: null, structured: [] } as Group);

      if (v.type === 'raw') {
        g.raw = { id: v.id, originalIndex };
      } else {
        g.structured.push({ id: v.id, originalIndex });
      }

      byMajor.set(baseMajor, g);
    });

    // Sort major versions descending (newest first).
    return Array.from(byMajor.values()).sort((a, b) => b.baseMajor - a.baseMajor);
  }, [proofHistory]);

  const handleClose = () => setIsHistoryOpen(false);

  const restoreVersion = (index: number) => {
    setActiveVersionIndex(index);

    const versionToRestore = proofHistory[index];
    toast({
      title: 'Proof Restored',
      description: `Restored version ${versionToRestore.versionNumber} from ${versionToRestore.timestamp.toLocaleString()}`,
    });
  };

  const requestDelete = (id: string, title: string, description: string) => {
    setConfirm({ id, title, description });
  };

  const handleConfirmDelete = () => {
    if (!confirm) return;
    const id = confirm.id;
    setConfirm(null);

    deleteProofVersion(id);
    toast({
      title: 'Deleted',
      description: 'Proof version deleted.',
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 md:p-4 border-b flex items-center justify-between">
        <h3 className="text-lg font-semibold font-headline">Proof History</h3>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <PanelLeftClose />
          <span className="sr-only">Close History</span>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 md:p-4 space-y-3">
          {proofHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-4">
              No history yet.
            </p>
          ) : (
            groups.map((g) => {
              const rawVersion =
                g.raw && proofHistory[g.raw.originalIndex]
                  ? proofHistory[g.raw.originalIndex]
                  : null;

              // Choose a representative "isActive" highlight for the group:
              const isGroupActive =
                rawVersion?.baseMajor === proofHistory[activeVersionIndex]?.baseMajor;

              const defaultTab = 'raw';

              return (
                <Card
                  key={g.baseMajor}
                  className={cn(
                    'hover:bg-muted/50 transition-colors',
                    isGroupActive && 'bg-primary/10 border-primary',
                  )}
                >
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {rawVersion?.validationResult?.isValid === true && (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          )}
                          {rawVersion?.validationResult?.isValid === false && (
                            <CheckCircle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                          <p className="text-sm font-medium truncate">
                            Version {g.baseMajor}
                          </p>
                        </div>
                        {/* no timestamp shown at group level */}
                      </div>

                      {g.raw && rawVersion && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            requestDelete(
                              g.raw!.id,
                              `Delete Version ${g.baseMajor}?`,
                              `This will delete raw version ${g.baseMajor} and all structured versions ${g.baseMajor}.*.`,
                            )
                          }
                          aria-label={`Delete Version ${g.baseMajor}`}
                          title={`Delete Version ${g.baseMajor}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <Tabs defaultValue={defaultTab}>
                      <TabsList className="w-full justify-start">
                        <TabsTrigger value="raw">Raw</TabsTrigger>
                        <TabsTrigger value="structured">
                          Structured ({g.structured.length})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="raw" className="mt-3">
                        {g.raw && rawVersion ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => restoreVersion(g.raw!.originalIndex)}
                              disabled={g.raw!.originalIndex === activeVersionIndex}
                            >
                              <Undo2 className="mr-2 h-4 w-4" />
                              Restore
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Raw proof is missing for this version.
                          </p>
                        )}
                      </TabsContent>

                      <TabsContent value="structured" className="mt-3">
                        {g.structured.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No structured versions yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {g.structured
                              .slice()
                              // Sort minors descending by parsing versionNumber X.Y
                              .sort((a, b) => {
                                const va = proofHistory[a.originalIndex];
                                const vb = proofHistory[b.originalIndex];
                                const ma =
                                  parseInt((va?.versionNumber || '').split('.')[1] || '0', 10) ||
                                  0;
                                const mb =
                                  parseInt((vb?.versionNumber || '').split('.')[1] || '0', 10) ||
                                  0;
                                return mb - ma;
                              })
                              .map((s) => {
                                const v = proofHistory[s.originalIndex];
                                const isActive = s.originalIndex === activeVersionIndex;
                                return (
                                  <div
                                    key={s.id}
                                    className={cn(
                                      'rounded-md border p-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
                                      isActive && 'border-primary bg-primary/5',
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">
                                        Version {v.versionNumber}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {v.timestamp.toLocaleString()}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2 justify-end">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => restoreVersion(s.originalIndex)}
                                        disabled={isActive}
                                      >
                                        <Undo2 className="mr-2 h-4 w-4" />
                                        Restore
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() =>
                                          requestDelete(
                                            s.id,
                                            `Delete ${v.versionNumber}?`,
                                            g.structured.length <= 1
                                              ? `This is the only structured version for ${g.baseMajor}. Deleting it will also delete the raw version ${g.baseMajor}.`
                                              : `This will delete structured version ${v.versionNumber} only.`,
                                          )
                                        }
                                        aria-label={`Delete ${v.versionNumber}`}
                                        title={`Delete ${v.versionNumber}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
