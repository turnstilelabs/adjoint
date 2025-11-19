import { Logo } from '../../logo';
import Link from 'next/link';

export function HomeHeader() {
  return (
    <div className="text-center mb-8">
      <div className="flex flex-col items-center justify-center">
        <Link href="/" className="flex flex-col items-center gap-4 group">
          <Logo />
          <h1
            className="text-4xl font-bold font-headline tracking-wider text-primary transition-colors"
            style={{ fontVariant: 'small-caps' }}
          >
            The Adjoint
          </h1>
        </Link>
      </div>
      <p className="mt-2 text-lg text-primary">Your canonical companion in reasoning.</p>
    </div>
  );
}
