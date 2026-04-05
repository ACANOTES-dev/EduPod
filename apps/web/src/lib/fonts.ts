import { Figtree, JetBrains_Mono } from 'next/font/google';

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const fonts = {
  className: `${figtree.variable} ${jetBrainsMono.variable}`,
  sans: figtree,
  mono: jetBrainsMono,
};
