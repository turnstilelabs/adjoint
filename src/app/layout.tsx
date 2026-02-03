import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/toaster';
import { Inter, Poppins, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';
import FeedbackWidget from '@/components/feedback/feedback-widget';
import dynamic from 'next/dynamic';

// IMPORTANT: keep app/layout chunk small.
// These are client-heavy and can cause dev chunk load timeouts if bundled into layout.
const WarmupClient = dynamic(
  () => import('@/components/warmup-client').then((m) => m.WarmupClient),
  { ssr: false },
);
const GlobalSelectionOverlay = dynamic(
  () => import('@/components/global-selection-overlay').then((m) => m.GlobalSelectionOverlay),
  { ssr: false },
);
const VerifyDialogController = dynamic(
  () => import('@/components/sympy/verify-dialog').then((m) => m.VerifyDialogController),
  { ssr: false },
);

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
        <WarmupClient />
        {children}
        <GlobalSelectionOverlay />
        <VerifyDialogController />
        {/* Global, non-intrusive feedback widget */}
        <FeedbackWidget />
        <Toaster />
      </body>
    </html>
  );
}
