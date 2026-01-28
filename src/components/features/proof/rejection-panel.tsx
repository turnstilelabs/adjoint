import { Button } from '@/components/ui/button';
import { KatexRenderer } from '@/components/katex-renderer';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

/**
 * Shared UI for showing a proof rejection (FAILED).
 *
 * Note: This is intentionally UI-only; we do not change model prompts/outputs.
 * We simply make the (potentially long) explanation opt-in via an accordion.
 */
export function RejectionPanel({
    explanation,
    onEdit,
    onRetry,
    onExplore,
}: {
    explanation: string;
    onEdit: () => void;
    onRetry: () => void | Promise<void>;
    onExplore: () => void;
}) {
    const safeExplanation = (explanation || '').trim() || 'No details provided.';

    return (
        <div className="mt-3 p-3 rounded-md border border-muted bg-background text-foreground shadow-sm">
            <div className="text-sm mb-2 font-medium">
                Could not prove the statement as written. It may be false or require stronger assumptions.
            </div>

            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="details" className="border-0">
                    <AccordionTrigger className="py-2 text-sm">Show details</AccordionTrigger>
                    <AccordionContent className="pb-0">
                        <div className="text-sm p-2 rounded-md bg-background border border-muted" data-selection-enabled="1">
                            {/*
                IMPORTANT:
                Rejection explanations are predominantly prose. Using the global math auto-wrap heuristic here
                can accidentally wrap long English runs into math mode, which causes:
                - spaces to be ignored (words become glued)
                - math italics applied to letters
                We therefore render only explicitly-delimited math ($...$, $$...$$, \(\), \[\], fenced ```math).
              */}
                            <KatexRenderer content={safeExplanation} autoWrap={false} />
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>

            <div className="flex flex-wrap items-center gap-2 mt-3">
                <Button size="sm" onClick={onEdit}>
                    Edit statement
                </Button>
                <Button size="sm" variant="outline" onClick={() => void onRetry()}>
                    Try again
                </Button>
                <Button size="sm" variant="ghost" onClick={onExplore}>
                    Explore instead
                </Button>
            </div>
        </div>
    );
}
