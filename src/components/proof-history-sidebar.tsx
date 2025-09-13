'use client';

import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { type ProofVersion } from './proof-display';
import { PanelLeftClose, Undo2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';

interface ProofHistorySidebarProps {
  history: ProofVersion[];
  onRestore: (version: ProofVersion) => void;
  onClose: () => void;
}

export function ProofHistorySidebar({ history, onRestore, onClose }: ProofHistorySidebarProps) {
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
            [...history].reverse().map((version, index) => (
            <Card key={history.length - 1 - index} className="group hover:bg-muted/50 transition-colors">
              <CardContent className='p-3'>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium">
                            Version {history.length - index}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {version.timestamp.toLocaleTimeString()}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRestore(version)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Undo2 className="mr-2" />
                        Restore
                    </Button>
                </div>
              </CardContent>
            </Card>
          )))}
        </div>
      </ScrollArea>
    </div>
  );
}
