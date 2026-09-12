import type { Metadata } from 'next';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'WestCose World — A place for what’s next', template: '%s · WestCose World' },
  description: 'Walk around a small coastal planet built around WestCose projects, services, games, and discoveries.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
