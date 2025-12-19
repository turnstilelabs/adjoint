'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter as DialogFooterArea,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function HomeFooter() {
  return (
    <div className="mt-16 text-center space-y-2">
      {/* Line 1 */}
      <p className="text-sm text-gray-500">
        The Adjoint is in active development.
        <Dialog>
          <DialogTrigger asChild>
            <a href="#" className="text-primary hover:underline ml-1">
              Learn more
            </a>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader className="!text-center sm:!text-center">
              <DialogTitle className="sr-only">Learn more</DialogTitle>
              <DialogDescription>
                We’re crafting the ideal workflow for mathematicians to develop, inspect, and refine proofs with LLM assistance.
              </DialogDescription>
            </DialogHeader>
            <div className="text-sm space-y-3">
              <div>
                <ul className="mt-1 list-disc list-inside space-y-1 text-left">
                  <li>Decompose proofs into lemmas with clear dependencies</li>
                  <li>Directly edit steps for fast iteration</li>
                  <li>Validate logic to flag gaps and inconsistencies</li>
                </ul>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>
                  This will only become excellent with community effort, your feedback and ideas are essential!
                </p>
              </div>
            </div>
            <DialogFooterArea>
              <a
                href="mailto:leo@turnstile.labs"
                className="text-sm text-primary hover:underline"
              >
                leo@turnstile.labs
              </a>
            </DialogFooterArea>
          </DialogContent>
        </Dialog>
        .
      </p>

      {/* Line 2 */}
      <p className="text-xs text-gray-500">
        © 2025 The Adjoint
        <span className="mx-2">•</span>
        <Dialog>
          <DialogTrigger asChild>
            <a href="#" className="hover:underline">
              Usage & Privacy
            </a>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Usage & Privacy</DialogTitle>
            </DialogHeader>
            <div className="text-sm space-y-2 text-left">
              <p>This demo may send your input to external model providers for inference. The usual thing about privacy: please don’t paste secrets. And yes, it can make mistakes — verify important results.</p>
            </div>
          </DialogContent>
        </Dialog>
        <span className="mx-2">•</span>
        <a href="mailto:leo@turnstile.labs" className="hover:underline">
          Contact
        </a>
      </p>
    </div>
  );
}
