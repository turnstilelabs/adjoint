"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MessageSquare, Send } from "lucide-react";

const emojis = [
    { v: 1, e: "😡", label: "Very unhappy" },
    { v: 2, e: "🙁", label: "Unhappy" },
    { v: 3, e: "😐", label: "Neutral" },
    { v: 4, e: "🙂", label: "Happy" },
    { v: 5, e: "😍", label: "Love it" },
];

export function FeedbackWidget() {
    const { toast } = useToast();
    const [open, setOpen] = React.useState(false);
    const [rating, setRating] = React.useState<number | null>(null);
    const [comment, setComment] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [includeMeta, setIncludeMeta] = React.useState(true);
    const [submitting, setSubmitting] = React.useState(false);
    const [tag, setTag] = React.useState<string | undefined>(undefined);
    const [source, setSource] = React.useState<string>("floating-widget");

    const reset = () => {
        setRating(null);
        setComment("");
        setEmail("");
        setIncludeMeta(true);
        setTag(undefined);
        setSource("floating-widget");
    };

    // Allow other components to open the widget and prefill values via a CustomEvent
    React.useEffect(() => {
        function onOpen(ev: Event) {
            try {
                const detail = (ev as CustomEvent).detail || {};
                if (typeof detail.rating === "number") setRating(detail.rating);
                if (typeof detail.comment === "string") setComment(detail.comment);
                if (typeof detail.tag === "string") setTag(detail.tag);
                if (typeof detail.source === "string") setSource(detail.source);
                setOpen(true);
            } catch {
                setOpen(true);
            }
        }
        window.addEventListener("open-feedback", onOpen as EventListener);
        return () => window.removeEventListener("open-feedback", onOpen as EventListener);
    }, []);

    const handleSubmit = async () => {
        if (!rating && !comment.trim()) {
            toast({ title: "Add a quick rating or note", description: "A rating or a short comment helps us improve." });
            return;
        }
        setSubmitting(true);
        try {
            const payload: any = {
                rating: rating ?? undefined,
                comment: comment.trim() || undefined,
                email: email.trim() || undefined,
                timestamp: new Date().toISOString(),
                tag,
                source,
            };
            if (includeMeta && typeof window !== "undefined") {
                payload.url = window.location.href;
                payload.userAgent = navigator.userAgent;
                payload.language = navigator.language;
            }
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                let msg = `HTTP ${res.status}`;
                try {
                    const data = await res.json();
                    if (data?.error) msg = String(data.error);
                } catch { }
                toast({ title: "Couldn't send feedback", description: msg });
                return;
            }
            toast({ title: "Thanks!", description: "Your feedback was sent." });
            setOpen(false);
            reset();
        } catch (e) {
            console.error("Feedback submit failed", e);
            toast({ title: "Couldn't send feedback", description: "Please try again in a moment." });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            aria-label="Send feedback"
                            variant="secondary"
                            size="sm"
                            className="fixed bottom-4 right-4 z-50 rounded-full shadow-lg opacity-80 hover:opacity-100"
                            onClick={() => setOpen(true)}
                        >
                            <MessageSquare className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Share feedback</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="w-[440px] max-w-[calc(100vw-2rem)]">
                    <SheetHeader>
                        <SheetTitle>How was your experience?</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4 space-y-5">
                        <div>
                            <Label className="sr-only">How was your experience?</Label>
                            <div className="flex items-center gap-2">
                                {emojis.map((x) => (
                                    <button
                                        key={x.v}
                                        type="button"
                                        aria-label={x.label}
                                        className={cn(
                                            "h-10 w-10 rounded-full border text-xl transition-colors",
                                            rating === x.v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                                        )}
                                        onClick={() => setRating(x.v)}
                                    >
                                        <span aria-hidden>{x.e}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="fb-comment">Anything to add? (optional)</Label>
                            <Textarea
                                id="fb-comment"
                                placeholder="What worked well? What was confusing or broken?"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                rows={5}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="fb-email">Email (optional)</Label>
                            <Input
                                id="fb-email"
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                            <p className="text-xs text-muted-foreground">We may contact you for clarification. We will never share your email.</p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Checkbox id="fb-meta" checked={includeMeta} onCheckedChange={(v) => setIncludeMeta(Boolean(v))} />
                            <Label htmlFor="fb-meta" className="text-sm text-muted-foreground">Include page URL and device info</Label>
                        </div>
                    </div>

                    <SheetFooter className="mt-6">
                        <div className="flex w-full items-center justify-end gap-2">
                            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
                            <Button onClick={handleSubmit} disabled={submitting}>
                                <Send className="h-4 w-4 mr-2" />
                                Send
                            </Button>
                        </div>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </>
    );
}

export type OpenFeedbackDetail = { rating?: number; comment?: string; tag?: string; source?: string };
export function openFeedback(detail?: OpenFeedbackDetail) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("open-feedback", { detail: detail || {} }));
}

export default FeedbackWidget;
