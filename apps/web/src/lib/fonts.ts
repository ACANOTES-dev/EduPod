import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const fonts = {
  className: `${plusJakartaSans.variable} ${jetBrainsMono.variable}`,
  sans: plusJakartaSans,
  mono: jetBrainsMono,
};
