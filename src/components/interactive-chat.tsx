'use client';
import { useState, useTransition, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { askQuestionAction } from "@/app/actions";
import { KatexRenderer } from "./katex-renderer";
import { Avatar, AvatarFallback } from "./ui/avatar";

type Message = {
    role: 'user' | 'assistant';
    content: string;
};

interface InteractiveChatProps {
    proofSteps: string[];
}

export function InteractiveChat({ proofSteps }: InteractiveChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = () => {
        if (!input.trim()) return;

        const newMessages: Message[] = [...messages, { role: 'user', content: input }];
        setMessages(newMessages);
        const question = input;
        setInput('');

        startTransition(async () => {
            const result = await askQuestionAction(question, proofSteps);
            if (result.success && result.answer) {
                setMessages([...newMessages, { role: 'assistant', content: result.answer }]);
            } else {
                toast({
                    title: 'Error',
                    description: result.error || 'Failed to get an answer.',
                    variant: 'destructive',
                });
                setMessages(messages); // Revert messages on error
            }
        });
    };

    return (
        <div className="px-8 py-4 bg-card border-t mt-auto sticky bottom-0">
            <div className="max-w-4xl mx-auto">
                {messages.length > 0 && (
                    <div className="mb-4 space-y-4 max-h-64 overflow-y-auto">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex gap-3 text-sm ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'assistant' && <Avatar className="w-8 h-8 shrink-0"><AvatarFallback>AI</AvatarFallback></Avatar>}
                                <div className={`p-3 rounded-lg max-w-xl ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                    <KatexRenderer content={msg.content} />
                                </div>
                            </div>
                        ))}
                         <div ref={messagesEndRef} />
                    </div>
                )}
                <div className="relative">
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if(!isPending) handleSend();
                            }
                        }}
                        placeholder="Ask a question about the proof or request an example..."
                        rows={1}
                        className="w-full bg-gray-100 rounded-lg pl-4 pr-12 py-3 text-base resize-none focus-visible:ring-primary"
                        disabled={isPending}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleSend}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-primary"
                        disabled={isPending}
                        aria-label="Send message"
                    >
                        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </Button>
                </div>
            </div>
        </div>
    );
}
