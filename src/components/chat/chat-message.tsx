import type { DragEvent } from 'react';

import { Message } from '@/components/chat/interactive-chat';
import { KatexRenderer } from '@/components/katex-renderer';
import ChatTypingIndicator from '@/components/chat/chat-typing-indicator';
import MessageSuggestionSection from '@/components/chat/message/message-suggestion-section';
import { Button } from '@/components/ui/button';
import { GripVertical, Plus, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import {
  loadWorkspaceProject,
  saveWorkspaceProject,
  setCurrentWorkspaceProjectId,
} from '@/lib/persistence/workspace-projects';
import { useAppStore } from '@/state/app-store';
import { WorkspacePickerDialog } from '@/components/workspace/workspace-picker-dialog';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function ChatMessage({ message, autoWrapMath = false }: { message: Message; autoWrapMath?: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [openWorkspacePicker, setOpenWorkspacePicker] = useState(false);
  const view = useAppStore((s) => s.view);
  const setWorkspaceDoc = useAppStore((s) => (s as any).setWorkspaceDoc);
  const setWorkspaceMessages = useAppStore((s) => (s as any).setWorkspaceMessages);

  const attemptProofAction = message.actions?.find((a) => a.type === 'attempt_proof');
  const showAttemptProof = Boolean(attemptProofAction);

  // This per-message “add to workspace” control is intended for Explore chat.
  // (Workspace chat already has its own workflow and icons.)
  const canAddMessageToWorkspace =
    view === 'explore' && message.role === 'assistant' && String(message.content || '').trim().length > 0;

  const onDragStart = (e: DragEvent) => {
    try {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', String(message.content ?? ''));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`flex w-full gap-3 text-sm items-end min-w-0 ${message.role === 'user' ? 'justify-end' : 'justify-start'
        }`}
    >
      <div
        className={`group relative p-4 rounded-2xl break-words w-fit max-w-[85%] min-w-0 ${message.role === 'user'
          ? 'bg-primary text-primary-foreground shadow-md'
          : 'bg-card border border-border shadow-sm'
          }`}
        data-selection-enabled="1"
      >
        {/* Drag handle (shown on hover). Only this handle is draggable to avoid breaking text selection. */}
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag message into editor"
          title="Drag into editor"
          className={
            'absolute right-2 top-2 rounded-md p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100'
          }
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {canAddMessageToWorkspace && (
          <button
            type="button"
            onMouseDown={(e) => {
              // Don't collapse selection / bubble interactions.
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpenWorkspacePicker(true);
            }}
            aria-label="Add message to workspace"
            title="Add to workspace"
            className={
              'absolute right-10 top-2 rounded-md p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100'
            }
          >
            <Plus className="h-4 w-4" />
          </button>
        )}

        {message.role === 'assistant' && (
          <div className="text-xs text-muted-foreground mb-1 font-medium">The Adjoint</div>
        )}
        <KatexRenderer content={message.content} autoWrap={autoWrapMath} />

        {showAttemptProof && (
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('explore:open-attempt-proof-chooser'));
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {attemptProofAction?.label ?? 'Attempt Proof'}
            </Button>
          </div>
        )}

        {message.isTyping && (
          <div className="mt-2 space-y-2">
            {message.waitingMessage && (
              <div className="text-xs text-muted-foreground">{message.waitingMessage}</div>
            )}
            <ChatTypingIndicator />
            <div className="mt-3">
              <div className="mt-1 h-2 w-40 bg-muted rounded animate-pulse" />
              <div className="mt-1 h-2 w-64 bg-muted rounded animate-pulse" />
            </div>
          </div>
        )}
        <MessageSuggestionSection message={message} />

        <WorkspacePickerDialog
          open={openWorkspacePicker}
          onOpenChange={setOpenWorkspacePicker}
          title="Add to Workspace"
          description="Choose which workspace to append to."
          confirmLabel="Add"
          onConfirm={(workspaceId) => {
            const content = String(message.content || '').trim();
            if (!content) {
              setOpenWorkspacePicker(false);
              return;
            }

            const snippet = [
              '% --- Imported from chat message ---',
              content,
              '% --- End import from chat message ---',
            ].join('\n');

            try {
              const existing = loadWorkspaceProject(workspaceId);
              const prevDoc = String(existing?.doc ?? '');
              const nextDoc =
                prevDoc.trim().length > 0
                  ? `${prevDoc.replace(/\s*$/, '')}\n\n${snippet}\n`
                  : `${snippet}\n`;

              saveWorkspaceProject(workspaceId, {
                doc: nextDoc,
                messages: (existing?.messages ?? []) as any,
                uiState: existing?.uiState ?? {},
              });
              setCurrentWorkspaceProjectId(workspaceId);
              // Keep in-memory state aligned so opening Workspace is instant.
              try {
                if (typeof setWorkspaceDoc === 'function') setWorkspaceDoc(nextDoc);
                if (typeof setWorkspaceMessages === 'function')
                  setWorkspaceMessages((existing?.messages ?? []) as any);
              } catch {
                // ignore
              }

              setOpenWorkspacePicker(false);
              toast({
                title: 'Added to Workspace',
                description: 'The message was appended.',
                action: (
                  <ToastAction altText="Open workspace" onClick={() => router.push('/workspace')}>
                    Open workspace
                  </ToastAction>
                ),
              });
            } catch (e: any) {
              toast({
                title: 'Failed to add to Workspace',
                description: e?.message || 'Unexpected error.',
                variant: 'destructive',
              });
            }
          }}
        />
      </div>
    </div>
  );
}

export default ChatMessage;
