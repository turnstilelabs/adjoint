import type { Metadata } from 'next';
import { Inter, Poppins, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';
import { ClientGlobals } from '@/app/client-globals';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-source-code-pro',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Adjoint',
  description: 'Your canonical companion in reasoning.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${poppins.variable} ${sourceCodePro.variable}`}>
      <head>
        {/* GoatCounter analytics (disabled on localhost / dev to avoid chunk-load timeouts) */}
        {process.env.NODE_ENV === 'production' ? (
          // Avoid next/script here: dev chunk loading can become flaky when the browser
          // blocks/slow-loads third-party scripts, which presents as "Loading chunk app/layout failed".
          <script
            async
            src="https://gc.zgo.at/count.js"
            data-goatcounter="https://adjoint.goatcounter.com/count"
          />
        ) : null}
      </head>
      <body className="font-body antialiased">
        {children}
        <ClientGlobals />
      </body>
    </html>
  );
}
