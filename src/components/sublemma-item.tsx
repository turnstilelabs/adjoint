'use client';

import { useState } from 'react';
import { CheckCircle, MessageSquare, FilePenLine, ChevronDown, Sigma, CheckCircle2, Rocket, Puzzle, Lightbulb } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { KatexRenderer } from './katex-renderer';
import { VerifyModal } from './verify-modal';

interface SublemmaItemProps {
  step: number;
  title: string;
  content: string;
  isLast: boolean;
}

const icons = [
    { Icon: Sigma, bg: 'bg-blue-100', text: 'text-blue-600' },
    { Icon: Sigma, bg: 'bg-blue-100', text: 'text-blue-600' },
    { Icon: CheckCircle2, bg: 'bg-green-100', text: 'text-green-600' },
    { Icon: Rocket, bg: 'bg-purple-100', text: 'text-purple-600' },
    { Icon: Puzzle, bg: 'bg-orange-100', text: 'text-orange-600' },
    { Icon: Puzzle, bg: 'bg-orange-100', text: 'text-orange-600' },
    { Icon: Lightbulb, bg: 'bg-indigo-100', text: 'text-indigo-600' },
];

export function SublemmaItem({ step, title, content, isLast }: SublemmaItemProps) {
  const { Icon, bg, text } = icons[(step - 1) % icons.length];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [verifiedContent, setVerifiedContent] = useState<string | null>(null);

  const handleVerificationComplete = (proof: string) => {
    setVerifiedContent(proof);
    setIsModalOpen(false);
  };
  
  return (
    <>
      <AccordionItem value={`item-${step}`} className="bg-card border-gray-200 rounded-xl shadow-sm overflow-hidden border">
        <AccordionTrigger className="flex items-center justify-between w-full p-5 cursor-pointer hover:bg-muted/50 hover:no-underline [&[data-state=open]>svg]:rotate-180">
          <div className="flex items-center gap-4">
            <span className={`p-2 rounded-full ${bg}`}>
                <Icon className={`h-5 w-5 ${text}`} />
            </span>
            <span className="text-base font-medium text-gray-900 font-headline">{title}</span>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-gray-500 transition-transform duration-200" />
        </AccordionTrigger>
        <AccordionContent className="p-5 pt-0 border-t">
          <div className="py-4">
            <KatexRenderer content={content} />
            {isLast && (
              <span className="inline-block px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full mt-4">
                Q.E.D.
              </span>
            )}
          </div>

          {verifiedContent && (
             <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="text-sm font-semibold mb-2 text-gray-700">Verified Sub-Proof:</h4>
                <pre className="w-full bg-gray-900 text-gray-200 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
                    <code>{verifiedContent}</code>
                </pre>
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 hover:text-green-700 rounded-full"
              onClick={() => setIsModalOpen(true)}
            >
              <CheckCircle className="mr-1.5 h-4 w-4" />
              Verify
            </Button>
            <Button variant="ghost" size="sm" className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 rounded-full">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Comment
            </Button>
            <Button variant="ghost" size="sm" className="text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 hover:text-blue-700 rounded-full">
              <FilePenLine className="mr-1.5 h-4 w-4" />
              Revise
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
      <VerifyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        step={step}
        lemma={content}
        onProofComplete={handleVerificationComplete}
      />
    </>
  );
}
