'use client';

import React, { useMemo } from 'react';
import katex from 'katex';

type KatexRendererProps = {
  content: string;
  className?: string;
};

export function KatexRenderer({ content, className }: KatexRendererProps) {
  const parts = useMemo(() => {
    // A more robust way to handle mixed text and math content.
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
          return <span key={index}>{part}</span>;
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
          return <span key={index}>{part}</span>;
        }
      } else {
        // This is a plain text part
        return <span key={index}>{part}</span>;
      }
    });
  }, [content]);

  return <div className={className}>{parts}</div>;
}