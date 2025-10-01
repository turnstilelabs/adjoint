'use client';

import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { type ProofVersion } from './proof-display';
import { PanelLeftClose, Undo2, CheckCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';

interface ProofHistorySidebarProps {
  history: ProofVersion[];
  activeIndex: number;
  onRestore: (index: number) => void;
  onClose: () => void;
}

export function ProofHistorySidebar({ history, activeIndex, onRestore, onClose }: ProofHistorySidebarProps) {
  const reversedHistory = [...history].reverse();
  const reversedActiveIndex = history.length - 1 - activeIndex;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="text-lg font-semibold font-headline">Proof History</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <PanelLeftClose />
          <span className="sr-only">Close History</span>
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-4">No history yet.</p>
          ) : (
            reversedHistory.map((version, index) => {
              const originalIndex = history.length - 1 - index;
              const isActive = index === reversedActiveIndex;
              return (
                <Card
                  key={originalIndex}
                  className={cn(
                    "group hover:bg-muted/50 transition-colors",
                    isActive && "bg-primary/10 border-primary"
                  )}
                >
                  <CardContent className='p-3'>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {version.isValid === true && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                        {version.isValid === false && <CheckCircle className="h-4 w-4 text-destructive shrink-0" />}
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            Version {history.length - index}
                          </p>
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
                          onClick={() => onRestore(originalIndex)}
                          className={cn("opacity-0 group-hover:opacity-100 transition-opacity", isActive && "opacity-100")}
                          disabled={isActive}
                        >
                          <Undo2 className="mr-2 h-4 w-4" />
                          Restore
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
