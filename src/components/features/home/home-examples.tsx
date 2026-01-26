import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import exampleProblems from './home-examples-problems.json';
import { useRouter } from 'next/navigation';

function HomeExamples() {
  const router = useRouter();

  return (
    <div className="mt-16 text-center">
      <h2 className="text-2xl font-bold font-headline text-primary">Sample Problems</h2>
      <div className="mt-8 grid gap-8 md:grid-cols-3">
        {exampleProblems.map((example, index) => (
          <Card key={index} className="text-left flex flex-col">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-primary">
                {example.level.replace(/\s*\([^)]*\)\s*/g, ' ').trim()}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 h-48 md:h-56 overflow-hidden pr-1">
              <KatexRenderer
                content={(() => {
                  if (example.level.startsWith('Brezis-Gallouet')) {
                    const marker = 'the following estimate holds:';
                    const idx = example.problem.indexOf(marker);
                    return idx >= 0 ? example.problem.slice(0, idx + marker.length) + ' ...' : example.problem;
                  }
                  if (example.level.startsWith("McDiarmid")) {
                    const close = '\\]';
                    const idx = example.problem.indexOf(close);
                    let preview = idx >= 0 ? example.problem.slice(0, idx + close.length) : example.problem;
                    // Remove any trailing ellipsis or whitespace-only/ellipsis-only trailing line
                    preview = preview.replace(/[\s\n]*(?:…|\.{3})\s*$/g, '');
                    return preview.trimEnd();
                  }
                  return example.problem;
                })()}
                className="text-sm"
                autoWrap={false}
              />
            </CardContent>
            <div className="p-6 pt-0 mt-auto">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push(`/prove?q=${encodeURIComponent(example.problem)}`)}
              >
                Attempt Proof <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default HomeExamples;
