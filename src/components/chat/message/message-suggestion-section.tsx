import { Message } from '@/components/chat/interactive-chat';
import { mergeRevised } from '@/components/chat/message/mergeRevised';
import { useAppStore } from '@/state/app-store';
import { computeProofDiff } from '@/components/chat/message/computeProofDiff';
import { Button } from '@/components/ui/button';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import MessageSuggestionDiff from '@/components/chat/message/message-suggestion-diff';

function MessageSuggestionSection({ message }: { message: Message }) {
  const proof = useAppStore((s) => s.proof());
  const setMessages = useAppStore((s) => s.setMessages);
  const addProofVersion = useAppStore((s) => s.addProofVersion);

  if (message.isTyping || !message.suggestion || !message.suggestion.revisedSublemmas.length) {
    return null;
  }

  const revisedRaw = message.suggestion!.revisedSublemmas;
  const effective = mergeRevised(proof.sublemmas, revisedRaw);
  const diff = computeProofDiff(proof.sublemmas, effective);

  const onAccept = () => {
    setMessages((messages) =>
      messages.map((msg) =>
        msg === message
          ? {
              ...msg,
              suggestion: {
                ...msg.suggestion!,
                isHandled: true,
                status: 'accepted',
                prevSublemmas: proof.sublemmas,
              },
            }
          : msg,
      ),
    );

    addProofVersion({ sublemmas: effective });
  };

  const onDecline = () => {
    setMessages((messages) =>
      messages.map((msg) =>
        msg === message
          ? {
              ...msg,
              suggestion: {
                ...message.suggestion!,
                isHandled: true,
                status: 'declined',
              },
            }
          : msg,
      ),
    );
  };

  return (
    <>
      {message.suggestion && !message.suggestion.isHandled && (
        <div className="mt-4 pt-3 border-t border-muted-foreground/20">
          <div className="mb-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Proposed proof changes (preview)
            </div>
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              <MessageSuggestionDiff diff={diff} />
            </div>
          </div>
          {diff.length && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onAccept}>
                <ThumbsUp className="mr-2" /> Accept Proposed Changes
              </Button>
              <Button variant="ghost" size="sm" onClick={onDecline}>
                <ThumbsDown className="mr-2" /> Decline
              </Button>
            </div>
          )}
        </div>
      )}
      {message.suggestion?.isHandled && (
        <div className="mt-4 pt-3 border-t border-muted-foreground/20">
          <div className="text-xs text-muted-foreground mb-2">
            {message.suggestion.status === 'accepted' && 'Accepted by user.'}
            {message.suggestion.status === 'declined' && 'Declined.'}
            {message.suggestion.status === 'reverted' && 'Reverted to previous version.'}
          </div>
        </div>
      )}
    </>
  );
}

export default MessageSuggestionSection;
