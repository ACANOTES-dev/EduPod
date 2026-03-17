import type { Metadata } from 'next';
import * as React from 'react';

export const metadata: Metadata = {
  title: 'School OS',
  description: 'School Operating System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
