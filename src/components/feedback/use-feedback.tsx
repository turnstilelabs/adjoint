"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { openFeedback, type OpenFeedbackDetail } from "@/components/feedback/feedback-widget";

export type MicrosurveyOpts = {
    tag?: string;
    source?: string;
    prompt?: string;
};

export function useFeedback() {
    const { toast } = useToast();

    const open = React.useCallback((detail?: OpenFeedbackDetail) => {
        openFeedback(detail);
    }, []);

    const showWasThisHelpful = React.useCallback((opts?: MicrosurveyOpts) => {
        const tag = opts?.tag;
        const source = opts?.source ?? "microsurvey";
        const prompt = opts?.prompt ?? "Was this helpful?";

        // Render a compact toast with quick thumbs and progressive disclosure on click
        const t = toast({
            title: prompt,
            description: (
                <div className="mt-2 flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                            // Prefill positive rating and open widget for optional details
                            open({ rating: 5, tag, source: `${source}:yes` });
                            t.dismiss();
                        }}
                    >
                        <ThumbsUp className="h-4 w-4 mr-1" /> Yes
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                            open({ rating: 2, tag, source: `${source}:no` });
                            t.dismiss();
                        }}
                    >
                        <ThumbsDown className="h-4 w-4 mr-1" /> No
                    </Button>
                </div>
            ),
        });
        return t;
    }, [toast, open]);

    return { open, showWasThisHelpful };
}
