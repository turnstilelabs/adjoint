'use client';

import React from 'react';
import katex from 'katex';

type KatexRendererProps = {
  content: string;
  className?: string;
};

export function KatexRenderer({ content, className }: KatexRendererProps) {
  const renderMath = (text: string) => {
    const renderedText = text.replace(/\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$/g, (match, display, inline) => {
      const latex = display || inline;
      try {
        return katex.renderToString(latex, {
          throwOnError: false,
          displayMode: !!display,
        });
      } catch (error) {
        console.error('KaTeX rendering error:', error);
        return match; // return original string on error
      }
    });
    return <div className={className} dangerouslySetInnerHTML={{ __html: renderedText }} />;
  };

  return renderMath(content);
}
