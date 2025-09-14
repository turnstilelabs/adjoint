import { Logo } from './logo';
import Link from 'next/link';

export function Header() {
  return (
    <div className="flex flex-col items-center justify-center">
        <Link href="/" className="flex flex-col items-center gap-4 group">
        <Logo />
        <h1 className="text-4xl font-bold font-headline tracking-wider text-gray-900 group-hover:text-primary transition-colors" style={{fontVariant: 'small-caps'}}>
            The Adjoint
        </h1>
        </Link>
    </div>
  );
}
