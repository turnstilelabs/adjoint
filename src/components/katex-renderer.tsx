'use client';

import { useEffect, useRef } from 'react';
import katex from 'katex';

type KatexRendererProps = {
  content: string;
  className?: string;
};

export function KatexRenderer({ content, className }: KatexRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // This regex finds all KaTeX blocks, including those with custom delimiters.
  const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\)|\$.*?\$)/g;

  // Split the content into parts: KaTeX blocks and the text between them.
  const parts = content.split(regex).filter(Boolean);

  return (
    <div ref={containerRef} className={className}>
      {parts.map((part, index) => {
        if (regex.test(part)) {
          // It's a KaTeX block. Let's render it.
          // First, remove the delimiters.
          let formula = part;
          if (part.startsWith('$$') && part.endsWith('$$')) {
            formula = part.substring(2, part.length - 2);
          } else if (part.startsWith('\\[')) {
            formula = part.substring(2, part.length - 2);
          } else if (part.startsWith('$')) {
            formula = part.substring(1, part.length - 1);
          } else if (part.startsWith('\\(')) {
            formula = part.substring(2, part.length - 2);
          }
          
          const isDisplayMode = part.startsWith('$$') || part.startsWith('\\[');

          try {
            const html = katex.renderToString(formula, {
              throwOnError: false,
              displayMode: isDisplayMode,
            });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            console.error('KaTeX rendering error', e);
            // Fallback: just show the raw TeX.
            return <code key={index}>{part}</code>;
          }
        } else {
          // It's just plain text.
          return <span key={index}>{part}</span>;
        }
      })}
    </div>
  );
}
