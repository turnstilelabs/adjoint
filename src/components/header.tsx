import { Logo } from './logo';

export function Header() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <Logo />
      <h1 className="text-4xl font-bold font-headline tracking-wider text-gray-900" style={{fontVariant: 'small-caps'}}>
        The Adjoint
      </h1>
    </div>
  );
}
