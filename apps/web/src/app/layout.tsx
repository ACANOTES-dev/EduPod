import type { Metadata } from 'next';
import * as React from 'react';

export const metadata: Metadata = {
  title: 'School OS',
  description: 'School Operating System',
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
