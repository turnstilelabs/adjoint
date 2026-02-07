'use client';

import * as React from 'react';
import { HomeHeader } from '@/components/features/home/home-header';
import HomeExamples from '@/components/features/home/home-examples';
import { HomeFooter } from '@/components/features/home/home-footer';
import { Button } from '@/components/ui/button';
import { FolderOpen, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useAppStore } from '@/state/app-store';
import { useRouter } from 'next/navigation';
import {
  createWorkspaceProject,
  deleteWorkspaceProject,
  listWorkspaceProjects,
  setCurrentWorkspaceProjectId,
} from '@/lib/persistence/workspace-projects';

const DEFAULT_TITLE = 'Untitled';

export default function HomeView() {
  const router = useRouter();

  const [workspaceModalOpen, setWorkspaceModalOpen] = React.useState(false);
  const [projects, setProjects] = React.useState<ReturnType<typeof listWorkspaceProjects>>([]);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const confirmDeleteTitle = React.useMemo(() => {
    const id = String(confirmDeleteId || '').trim();
    if (!id) return null;
    const meta = (projects || []).find((p) => p.id === id);
    return (meta?.title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;
  }, [confirmDeleteId, projects]);

  // In-memory store draft is not reliable after a full refresh.
  // Use persisted projects list as the primary indicator for “Resume”.
  const hasAnyWorkspaceProjects = (projects || []).length > 0;

  const hasDraft = useAppStore((s) => (s.workspaceDoc || '').trim().length > 0);

  const refreshProjects = React.useCallback(() => {
    try {
      setProjects(listWorkspaceProjects());
    } catch {
      setProjects([]);
    }
  }, []);

  React.useEffect(() => {
    // Keep list fresh when arriving on Home (client only).
    setIsHydrated(true);
    refreshProjects();
  }, [refreshProjects]);

  const openWorkspaceModal = () => {
    refreshProjects();
    setWorkspaceModalOpen(true);
  };

  const startWriting = () => {
    // First-time UX: no existing projects -> jump straight into a fresh Workspace.
    // (No modal/picker.)
    const existing = listWorkspaceProjects();
    if (existing.length === 0) {
      createNewProjectAndOpen();
      return;
    }
    openWorkspaceModal();
  };

  const openProject = (id: string) => {
    const trimmed = String(id || '').trim();
    if (!trimmed) return;
    try {
      setCurrentWorkspaceProjectId(trimmed);
    } catch {
      // ignore
    }
    setWorkspaceModalOpen(false);
    router.push('/workspace');
  };

  const createNewProjectAndOpen = () => {
    try {
      const meta = createWorkspaceProject({ title: DEFAULT_TITLE, kind: 'project' });
      setCurrentWorkspaceProjectId(meta.id);
      // For first-time “Start writing” we want to avoid a visible CTA label flip
      // on Home. So do NOT refresh projects here; Home will refresh on mount.
      setWorkspaceModalOpen(false);
      router.push('/workspace');
    } catch {
      // ignore
      setWorkspaceModalOpen(false);
      router.push('/workspace?new=1');
    }
  };

  const confirmDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const doDelete = () => {
    const id = String(confirmDeleteId || '').trim();
    if (!id) return;
    try {
      deleteWorkspaceProject(id);
    } catch {
      // ignore
    } finally {
      setConfirmDeleteId(null);
      // Refresh list and if we just deleted the last project, close the modal.
      // (So user returns to Home with “Start writing”, instead of seeing an empty modal.)
      try {
        const next = listWorkspaceProjects();
        setProjects(next);
        if (next.length === 0) setWorkspaceModalOpen(false);
      } catch {
        setProjects([]);
        setWorkspaceModalOpen(false);
      }
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-8 flex flex-col">
      <HomeHeader />

      {/* Workspace-first UX: Home is only a project picker / launcher. */}
      <div className="-mt-2 mb-6">
        <div className="mt-2 text-center text-xs text-muted-foreground">
          Create or resume a Workspace to draft notes, chat, extract candidate statements, and launch proof attempts.
        </div>
      </div>

      <div className="mb-6 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center justify-center gap-2">
          <Button size="lg" onClick={startWriting}>
            {isHydrated && (hasAnyWorkspaceProjects || hasDraft)
              ? 'Resume workspace'
              : 'Create workspace'}
          </Button>
        </div>
      </div>

      {/* Workspace project picker modal */}
      <Dialog
        open={workspaceModalOpen}
        onOpenChange={(open) => {
          setWorkspaceModalOpen(open);
          if (open) refreshProjects();
        }}
      >
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Workspace</DialogTitle>
            <DialogDescription>
              Pick a project to continue, or start a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {(projects || []).length === 0 ? (
              <div className="rounded-md border p-6 text-center space-y-3">
                <div className="text-sm text-muted-foreground">
                  No workspace yet. Create one to start drafting.
                </div>
                <Button onClick={createNewProjectAndOpen}>Create Workspace</Button>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <div className="divide-y">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 bg-background"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openProject(p.id)}
                      >
                        <div className="truncate text-sm font-medium">{p.title || DEFAULT_TITLE}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ''}
                        </div>
                      </button>

                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openProject(p.id)}
                          title="Open"
                          aria-label="Open"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => confirmDelete(p.id)}
                          title="Delete"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkspaceModalOpen(false)}>
              Close
            </Button>
            {(projects || []).length > 0 ? <Button onClick={createNewProjectAndOpen}>New</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => (!open ? setConfirmDeleteId(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{confirmDeleteTitle || DEFAULT_TITLE}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HomeExamples />
      <HomeFooter />
    </div>
  );
}
