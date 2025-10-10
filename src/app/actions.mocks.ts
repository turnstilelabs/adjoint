export const decomposeProblemFixture = {
  sublemmas: [
    {
      title: 'Lemma 1: Equivalent Form via Substitution',
      content:
        'Let $a, b, c$ be positive real numbers such that $abc=1$. The inequality $\\frac{1}{a^3(b+c)} + \\frac{1}{b^3(c+a)} + \\frac{1}{c^3(a+b)} \\ge \\frac{3}{2}$ is equivalent to the inequality $\\frac{x^2}{y+z} + \\frac{y^2}{z+x} + \\frac{z^2}{x+y} \\ge \\frac{3}{2}$ for positive real numbers $x, y, z$ such that $xyz=1$, where $a=1/x, b=1/y, c=1/z$ form the substitution.',
    },
    {
      title: 'Lemma 2: Lower Bound using Cauchy-Schwarz Inequality',
      content:
        'For any positive real numbers $x, y, z$, the expression $\\frac{x^2}{y+z} + \\frac{y^2}{z+x} + \\frac{z^2}{x+y}$ satisfies the inequality $\\frac{x^2}{y+z} + \\frac{y^2}{z+x} + \\frac{z^2}{x+y} \\ge \\frac{(x+y+z)^2}{2(x+y+z)}$, which simplifies to $\\frac{x+y+z}{2}$.',
    },
    {
      title: 'Lemma 3: AM-GM Inequality for Product One',
      content:
        'For any positive real numbers $x, y, z$ such that $xyz=1$, the Arithmetic Mean-Geometric Mean (AM-GM) inequality implies that $x+y+z \\ge 3$.',
    },
  ],
};

export const generateProofGraphFixture = {
  nodes: [
    { id: 'step-1', label: 'Lemma 1: Equivalent Form via Substitution' },
    { id: 'step-2', label: 'Lemma 2: Lower Bound using Cauchy-Schwarz Inequality' },
    { id: 'step-3', label: 'Lemma 3: AM-GM Inequality for Product One' },
  ],
  edges: [
    { id: 'edge-2-1', source: 'step-2', target: 'step-1' },
    { id: 'edge-3-1', source: 'step-3', target: 'step-1' },
  ],
};
