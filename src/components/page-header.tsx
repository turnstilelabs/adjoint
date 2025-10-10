import { LogoSmall } from './logo-small';
import Link from 'next/link';
import { Separator } from './ui/separator';

export function PageHeader() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <LogoSmall />
          <h1
            className="text-xl font-bold font-headline tracking-wide text-gray-800 group-hover:text-primary transition-colors"
            style={{ fontVariant: 'small-caps' }}
          >
            The Adjoint
          </h1>
        </Link>
      </div>
      <Separator className="mt-4" />
    </div>
  );
}
