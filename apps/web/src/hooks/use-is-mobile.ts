'use client';

import * as React from 'react';

const DEFAULT_BREAKPOINT = 768;

function getMediaQuery(breakpoint: number): string {
  return `(max-width: ${breakpoint - 1}px)`;
}

function getIsMobile(breakpoint: number): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia(getMediaQuery(breakpoint)).matches;
}

export function useIsMobile(breakpoint = DEFAULT_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = React.useState(() => getIsMobile(breakpoint));

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(getMediaQuery(breakpoint));
    const update = () => setIsMobile(mediaQuery.matches);

    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);

      return () => {
        mediaQuery.removeEventListener('change', update);
      };
    }

    mediaQuery.addListener(update);

    return () => {
      mediaQuery.removeListener(update);
    };
  }, [breakpoint]);

  return isMobile;
}
