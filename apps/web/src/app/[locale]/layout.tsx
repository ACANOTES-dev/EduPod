import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import * as React from 'react';

import '@/styles/globals.css';
import { locales, type Locale } from '../../../i18n/config';
import { DirectionProvider } from '@/providers/direction-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { ShortcutProvider } from '@/providers/shortcut-provider';
import { SwRegister } from '@/providers/sw-register';
import { ThemeProvider } from '@/providers/theme-provider';
import { fonts } from '@/lib/fonts';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function LocaleLayout({ children, params: { locale } }: LocaleLayoutProps) {
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={fonts.className}>
      <body className="bg-background text-text-primary antialiased">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <DirectionProvider locale={locale}>
              <AuthProvider>
                <ShortcutProvider>
                  <SwRegister />
                  {children}
                </ShortcutProvider>
              </AuthProvider>
            </DirectionProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
