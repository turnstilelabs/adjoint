/*
 * Reusable Workspace picker dialog.
 *
 * Used by:
 * - Prover mode “Add to Workspace”
 * - Selection toolbars (highlighted text → add to workspace)
 * - Explore chat per-message “Add to Workspace”
 */

'use client';

import * as React from 'react';
import {
    createWorkspaceProject,
    getCurrentWorkspaceProjectId,
    listWorkspaceProjects,
    type WorkspaceProjectMeta,
} from '@/lib/persistence/workspace-projects';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export type WorkspacePickerDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    description?: React.ReactNode;
    confirmLabel?: string;
    /** Called with the chosen workspace project id. */
    onConfirm: (workspaceId: string) => void;
    /** Optional: allow the parent to be notified when a new workspace was created. */
    onCreated?: (meta: WorkspaceProjectMeta) => void;
};

export function WorkspacePickerDialog({
    open,
    onOpenChange,
    title = 'Add to Workspace',
    description = 'Choose which workspace to append to.',
    confirmLabel = 'Add',
    onConfirm,
    onCreated,
}: WorkspacePickerDialogProps) {
    const [options, setOptions] = React.useState<WorkspaceProjectMeta[]>([]);
    const [selectedId, setSelectedId] = React.useState<string>('');

    const refresh = React.useCallback(() => {
        try {
            const list = listWorkspaceProjects();
            setOptions(list);

            const cur = getCurrentWorkspaceProjectId();
            const nextSel =
                (cur && list.some((m) => m.id === cur) ? cur : '') || selectedId || list[0]?.id || '';
            setSelectedId(nextSel);
        } catch {
            setOptions([]);
            setSelectedId('');
        }
    }, [selectedId]);

    React.useEffect(() => {
        if (!open) return;
        refresh();
    }, [open, refresh]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                {options.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No Workspace projects found. Create one first.</div>
                ) : (
                    <RadioGroup
                        value={selectedId}
                        onValueChange={(v) => setSelectedId(String(v || ''))}
                        className="gap-3"
                    >
                        {options.map((m) => (
                            <div key={m.id} className="flex items-start gap-3 rounded-md border p-3">
                                <RadioGroupItem value={m.id} id={`ws-${m.id}`} className="mt-0.5" />
                                <Label htmlFor={`ws-${m.id}`} className="min-w-0 flex-1 cursor-pointer">
                                    <div className="text-sm font-medium truncate">{m.title || 'Untitled'}</div>
                                    <div className="text-xs text-muted-foreground">
                                        Last updated {new Date(m.updatedAt || 0).toLocaleString()}
                                    </div>
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>

                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                            try {
                                const meta = createWorkspaceProject({ title: 'Untitled', kind: 'project' });
                                onCreated?.(meta);
                                refresh();
                                setSelectedId(meta.id);
                            } catch {
                                // ignore (parent can show error if desired)
                            }
                        }}
                    >
                        New Workspace
                    </Button>

                    <Button
                        type="button"
                        onClick={() => {
                            const id = String(selectedId || '').trim();
                            if (!id) return;
                            onConfirm(id);
                        }}
                        disabled={!String(selectedId || '').trim()}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
