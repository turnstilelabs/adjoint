'use client';

import { CheckCircle2, Rocket, Puzzle, Lightbulb, Sigma } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { KatexRenderer } from './katex-renderer';

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
  
  return (
    <>
      <AccordionItem value={`item-${step}`} className="bg-card border-gray-200 rounded-xl shadow-sm overflow-hidden border">
        <AccordionTrigger className="flex items-center justify-between w-full p-5 cursor-pointer hover:bg-muted/50 hover:no-underline">
          <div className="flex items-center gap-4">
            <span className={`p-2 rounded-full ${bg}`}>
                <Icon className={`h-5 w-5 ${text}`} />
            </span>
            <span className="text-base font-medium text-gray-900 font-headline">{title}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-5 pt-0 border-t">
          <div className="py-4">
            <KatexRenderer content={content} />
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );
}
