import ProblemInputForm from '@/components/problem-input-form';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KatexRenderer } from '@/components/katex-renderer';

const exampleProblems = [
  {
    level: 'IMO-Level Inequality',
    problem:
      'Let $a, b, c$ be positive real numbers such that $abc = 1$. Prove that $\\frac{1}{a^3(b+c)} + \\frac{1}{b^3(c+a)} + \\frac{1}{c^3(a+b)} \\ge \\frac{3}{2}$.',
    href: '/proof?problem=Let+%24a%2C+b%2C+c%24+be+positive+real+numbers+such+that+%24abc+%3D+1%24.+Prove+that+%24%5Cfrac%7B1%7D%7Ba%5E3%28b%2Bc%29%7D+%2B+%5Cfrac%7B1%7D%7Bb%5E3%28c%2Ba%29%7D+%2B+%5Cfrac%7B1%7D%7Bc%5E3%28a%2Bb%29%7D+%5Cge+%5Cfrac%7B3%7D%7B2%7D%24.',
  },
  {
    level: "Lagrange's Theorem",
    problem:
      "Prove that if $G$ is a finite group and $H$ is a subgroup of $G$, then the order of $H$ divides the order of $G$.",
    href: "/proof?problem=Prove+that+if+%24G%24+is+a+finite+group+and+%24H%24+is+a+subgroup+of+%24G%24%2C+then+the+order+of+%24H%24+divides+the+order+of+%24G%24+%28Lagrange%27s+Theorem%29.",
  },
  {
    level: 'Banach-Alaoglu Theorem',
    problem:
      'Prove that the closed unit ball in the dual of a normed vector space is compact in the weak-* topology.',
    href: '/proof?problem=Prove+the+Banach-Alaoglu+theorem%3A+The+closed+unit+ball+in+the+dual+of+a+normed+vector+space+is+compact+in+the+weak-%2A+topology.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen bg-background">
      <main className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold font-headline text-gray-900">
                Start a New Proof
              </h1>
              <p className="mt-2 text-lg text-gray-600">
                Enter your problem in LaTeX or natural language.
              </p>
            </div>
            <ProblemInputForm />
            <div className="mt-16 text-center">
              <h2 className="text-2xl font-bold font-headline text-gray-800">
                Or, start with an example
              </h2>
              <div className="mt-8 grid gap-8 md:grid-cols-3">
                {exampleProblems.map((example, index) => (
                  <Card key={index} className="text-left flex flex-col">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-primary">{example.level}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <KatexRenderer content={example.problem} className="text-sm" />
                    </CardContent>
                    <div className="p-6 pt-0 mt-auto">
                      <Link href={example.href}>
                        <Button variant="outline" className="w-full">
                          Start Proof <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
            <div className="mt-16 text-center">
              <p className="text-sm text-gray-500">
                Autocomplete and error highlighting for LaTeX are active.
                <a href="#" className="text-primary hover:underline ml-1">
                  Learn more
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
