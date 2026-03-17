'use client';

import * as React from 'react';

type Direction = 'ltr' | 'rtl';

const DirectionContext = React.createContext<Direction>('ltr');

export function DirectionProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const direction: Direction = locale === 'ar' ? 'rtl' : 'ltr';

  return <DirectionContext.Provider value={direction}>{children}</DirectionContext.Provider>;
}

export function useDirection(): Direction {
  return React.useContext(DirectionContext);
}
