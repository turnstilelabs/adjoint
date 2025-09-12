'use client';

import { useEffect, useRef } from 'react';

type KatexRendererProps = {
  content: string;
  className?: string;
};

export function KatexRenderer({ content, className }: KatexRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && window.renderMathInElement) {
      try {
        window.renderMathInElement(containerRef.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false
        });
      } catch (error) {
        console.error('KaTeX rendering error:', error);
      }
    }
  }, [content]);

  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: content }} />;
}
