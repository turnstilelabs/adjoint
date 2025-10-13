'use client';

import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';

export const escapeLatexText = (s: string) => {
  return s
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
};

export const buildLatexDocument = (problem: string, steps: Sublemma[]) => {
  const lines: string[] = [];
  lines.push('\\documentclass[11pt]{article}');
  lines.push('\\usepackage[utf8]{inputenc}');
  lines.push('\\usepackage[T1]{fontenc}');
  lines.push('\\usepackage{lmodern}');
  lines.push('\\usepackage{geometry}');
  lines.push('\\geometry{margin=1in}');
  lines.push('\\usepackage{microtype}');
  lines.push('\\usepackage{amsmath,amssymb,amsthm,mathtools}');
  lines.push('\\usepackage{enumitem}');
  lines.push('\\usepackage{xcolor}');
  lines.push('\\usepackage{hyperref}');
  lines.push('\\hypersetup{hidelinks}');
  lines.push('');
  lines.push('% theorem environments');
  lines.push('\\newtheorem{theorem}{Theorem}');
  lines.push('\\newtheorem{lemma}{Lemma}');
  lines.push('\\newtheorem{proposition}{Proposition}');
  lines.push('\\newtheorem{corollary}{Corollary}');
  lines.push('\\theoremstyle{definition}');
  lines.push('\\newtheorem{definition}{Definition}');
  lines.push('\\theoremstyle{remark}');
  lines.push('\\newtheorem{remark}{Remark}');
  lines.push('');
  lines.push('\\title{Tentative Proof Export}');
  lines.push('\\author{Adjoint}');
  lines.push('\\date{\\today}');
  lines.push('');
  lines.push('\\begin{document}');
  lines.push('\\maketitle');
  lines.push('');
  lines.push('\\section*{Problem}');
  lines.push('\\begin{quote}');
  lines.push(problem);
  lines.push('\\end{quote}');
  lines.push('');
  lines.push('\\section*{Proof Outline}');
  lines.push('\\begin{enumerate}[leftmargin=*, label=Step~\\arabic*:]');
  steps.forEach((s, i) => {
    const t = escapeLatexText(s.title || `Step ${i + 1}`);
    const titleWithPunct = /[.?!:]$/.test(t) ? t : `${t}.`;
    lines.push(`\\item \\textbf{${titleWithPunct}} ${s.content}`);
  });
  lines.push('\\end{enumerate}');
  lines.push('');
  lines.push('\\end{document}');
  return lines.join('\n');
};

export const exportProofTex = (problem: string, steps: Sublemma[], filename = 'proof.tex') => {
  const latex = buildLatexDocument(problem, steps);
  const blob = new Blob([latex], { type: 'application/x-tex' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
