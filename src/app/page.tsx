import { AppSidebar } from '@/components/sidebar';
import ProblemInputForm from '@/components/problem-input-form';

export default function Home() {
  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold font-headline text-gray-900">Start a New Proof</h1>
              <p className="mt-2 text-lg text-gray-600">Enter your problem in LaTeX or natural language.</p>
            </div>
            <ProblemInputForm />
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                Autocomplete and error highlighting for LaTeX are active.
                <a href="#" className="text-primary hover:underline ml-1">
                  Learn more
                </a>.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
