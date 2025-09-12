'use client';

import { useEffect, useRef } from 'react';

type KatexRendererProps = {
  content: string;
  className?: string;
};

export function KatexRenderer({ content, className }: KatexRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger re-render when content changes
    if (window.renderMathInElement && containerRef.current) {
      window.renderMathInElement(containerRef.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
      });
    }
  }, [content]);

  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: content }} />;
}
