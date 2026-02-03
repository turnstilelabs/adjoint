import { streamFlow } from '@genkit-ai/next/client';
import { interactiveAssistantFlow } from '@/ai/interactive-assistant/interactive-assistant.flow';
import { Message } from '@/components/chat/interactive-chat';
import { useAppStore } from '@/state/app-store';
import { pickWaitingMessage } from '@/components/chat/waitingMessages';

export const useSendMessage = () => {
  const messages = useAppStore((s) => s.messages);
  const problem = useAppStore((s) => s.problem!);
  const proof = useAppStore((s) => s.proof());

  const setMessages = useAppStore((s) => s.setMessages);
  const setChatCancelCurrent = useAppStore((s) => s.setChatCancelCurrent);

  return async (request: string) => {
    if (!request) return;

    // Cancel any in-flight chat request before starting a new one.
    try {
      useAppStore.getState().cancelChatCurrent?.();
    } catch {
      // ignore
    }

    const controller = new AbortController();
    setChatCancelCurrent(() => {
      try {
        if (!controller.signal.aborted) controller.abort();
      } catch {
        // ignore
      }
    });

    const userMessage: Message = { role: 'user', content: request };
    const newMessages = [...messages, userMessage];
    const typingMessage: Message = {
      role: 'assistant',
      content: '',
      isTyping: true,
      waitingMessage: pickWaitingMessage(),
    };
    setMessages([...newMessages, typingMessage]);

    const history = newMessages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    const runner = streamFlow<typeof interactiveAssistantFlow>({
      url: '/api/chat',
      abortSignal: controller.signal,
      input: { problem, proofSteps: proof.sublemmas, request, history },
    });

    try {
      // live chunks
      for await (const chunk of runner.stream) {
        if (chunk.type === 'text') {
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === prev.length - 1 ? { ...msg, content: msg.content + chunk.content } : msg,
            ),
          );
        } else if (chunk.type === 'proposal') {
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === prev.length - 1
                ? {
                  ...msg,
                  suggestion: { revisedSublemmas: chunk.revisedSublemmas, isHandled: false },
                }
                : msg,
            ),
          );
        }
      }

      await runner.output;
    } catch (e: any) {
      // Abort is an expected user action; don't surface as an error.
      const isAbort =
        e?.name === 'AbortError' ||
        e?.message === 'The operation was aborted.' ||
        String(e?.message || '').toLowerCase().includes('aborted');
      if (!isAbort) {
        // eslint-disable-next-line no-console
        console.error('[Chat] stream error', e);
      }
    } finally {
      setMessages((prev) =>
        prev.map((msg, idx) => (idx === prev.length - 1 ? { ...msg, isTyping: false } : msg)),
      );
      setChatCancelCurrent(null);
    }
  };
};
