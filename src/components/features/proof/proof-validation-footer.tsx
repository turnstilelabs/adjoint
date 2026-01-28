import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { KatexRenderer } from '@/components/katex-renderer';
import { useAppStore } from '@/state/app-store';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * ProofValidationFooter
 *
 * Displays the latest whole-proof analysis result (if any).
 *
 * NOTE: The action that triggers analysis has been moved to the left sidebar.
 */
function ProofValidationFooter() {
    const proof = useAppStore((s) => s.proof());
    const isAnalyzingProof = useAppStore((s) => s.isAnalyzingProof);
    const macros = useAppStore((s) => (s as any).proofRenderMacros as Record<string, string>);

    const alertRef = useRef<HTMLDivElement | null>(null);
    const [isOpen, setIsOpen] = useState(true);
    const lastResultTsRef = useRef<number | null>(null);

    // Auto-expand review when a fresh validation result arrives
    useEffect(() => {
        const ts = proof.validationResult?.timestamp
            ? new Date(proof.validationResult.timestamp).getTime()
            : null;
        if (ts && ts !== lastResultTsRef.current) {
            setIsOpen(true);
            lastResultTsRef.current = ts;
        }
    }, [proof.validationResult?.timestamp]);

    useEffect(() => {
        if (proof.validationResult && alertRef.current) {
            try {
                alertRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch {
                // ignore
            }
        }
    }, [proof.validationResult]);

    const result = proof.validationResult;

    if (!result && !isAnalyzingProof) return null;

    if (isAnalyzingProof) {
        return (
            <div className="mt-3">
                <Alert variant="default">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <AlertTitle className="text-xs text-foreground/90">Generating proof analysis…</AlertTitle>
                    <AlertDescription>
                        <div className="text-sm text-muted-foreground">
                            This can take a few seconds. Click the Analyze icon again to cancel.
                        </div>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    if (!result) return null;

    return (
        <div className="mt-3">
            <Accordion
                type="single"
                collapsible
                value={isOpen ? 'review' : undefined}
                onValueChange={(v) => setIsOpen(!!v)}
            >
                <AccordionItem value="review">
                    <AccordionTrigger className="sr-only">Proof analysis review</AccordionTrigger>
                    <AccordionContent>
                        <div ref={alertRef}>
                            <Alert variant="default">
                                {!result.isError && result.isValid === false && (
                                    <>
                                        <AlertTriangle className="h-4 w-4 text-primary" />
                                        <AlertTitle className="text-xs text-foreground/90">Issues found</AlertTitle>
                                    </>
                                )}
                                {result.isError && (
                                    <>
                                        <AlertCircle className="h-4 w-4 text-foreground" />
                                        <AlertTitle className="text-xs text-foreground/90">
                                            System issue — validation couldn’t complete
                                        </AlertTitle>
                                    </>
                                )}
                                {!result.isError && result.isValid === true && (
                                    <>
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        <AlertTitle className="text-xs text-foreground/90">Looks consistent</AlertTitle>
                                    </>
                                )}
                                <AlertDescription>
                                    <div className="rounded-md border-l-2 pl-3 py-2 bg-muted/30 border-primary/50 text-sm font-mono text-foreground/90">
                                        <KatexRenderer content={result.feedback} macros={macros} />
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">Automated analysis generated</div>
                                </AlertDescription>
                            </Alert>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}

export default ProofValidationFooter;
