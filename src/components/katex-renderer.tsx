'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

type KatexRendererProps = {
  content: string;
  className?: string;
};

// Helper function to create a React element from a text part, converting newlines to <br>
const renderTextWithLineBreaks = (text: string, key: number) => {
  const lines = text.split('\n');
  return (
    <React.Fragment key={key}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
};

export function KatexRenderer({ content, className }: KatexRendererProps) {
  const parts = useMemo(() => {
    // This regex splits the string by single or double dollar sign delimiters, keeping the delimiters.
    const splitByDelimiters = content.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/);
    
    return splitByDelimiters.map((part, index) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        const latex = part.substring(2, part.length - 2);
        try {
          const html = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: true,
          });
          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (error) {
          console.error('KaTeX rendering error:', error);
          return renderTextWithLineBreaks(part, index);
        }
      } else if (part.startsWith('$') && part.endsWith('$')) {
        const latex = part.substring(1, part.length - 1);
        try {
          const html = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: false,
          });
          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (error) {
          console.error('KaTeX rendering error:', error);
          return renderTextWithLineBreaks(part, index);
        }
      } else {
        // Render plain text parts, handling newlines
        return renderTextWithLineBreaks(part, index);
      }
    });
  }, [content]);

  // Use 'whitespace-pre-wrap' is no longer needed as we manually handle line breaks.
  return <div className={cn(className)}>{parts}</div>;
}
