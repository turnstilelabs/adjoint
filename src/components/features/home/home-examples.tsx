import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KatexRenderer } from '@/components/katex-renderer';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import exampleProblems from './home-examples-problems.json';
import { useAppStore } from '@/state/app-store';

function HomeExamples() {
  const startProof = useAppStore((s) => s.startProof);

  return (
    <div className="mt-16 text-center">
      <h2 className="text-2xl font-bold font-headline text-gray-800">Or, start with an example</h2>
      <div className="mt-8 grid gap-8 md:grid-cols-3">
        {exampleProblems.map((example, index) => (
          <Card key={index} className="text-left flex flex-col">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-primary">
                {example.level}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <KatexRenderer content={example.problem} className="text-sm" />
            </CardContent>
            <div className="p-6 pt-0 mt-auto">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => startProof(example.problem)}
              >
                Explore Proof <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default HomeExamples;
