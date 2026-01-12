import { streamFlow } from '@genkit-ai/next/client';
import { interactiveAssistantFlow } from '@/ai/interactive-assistant/interactive-assistant.flow';
import { Message } from '@/components/chat/interactive-chat';
import { useAppStore } from '@/state/app-store';

export const useSendMessage = () => {
  const messages = useAppStore((s) => s.messages);
  const problem = useAppStore((s) => s.problem!);
  const proof = useAppStore((s) => s.proof());

  const setMessages = useAppStore((s) => s.setMessages);

  return async (request: string) => {
    if (!request) return;

    const userMessage: Message = { role: 'user', content: request };
    const newMessages = [...messages, userMessage];
    const typingMessage: Message = {
      role: 'assistant',
      content: '',
      isTyping: true,
    };
    setMessages([...newMessages, typingMessage]);

    const history = newMessages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    const runner = streamFlow<typeof interactiveAssistantFlow>({
      url: '/api/chat',
      input: { problem, proofSteps: proof.sublemmas, request, history },
    });

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
    setMessages((prev) =>
      prev.map((msg, idx) => (idx === prev.length - 1 ? { ...msg, isTyping: false } : msg)),
    );
  };
};
