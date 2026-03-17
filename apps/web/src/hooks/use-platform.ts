'use client';

import { useEffect, useState } from 'react';

type Platform = 'mac' | 'windows' | 'linux' | 'unknown';

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>('unknown');

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) {
      setPlatform('mac');
    } else if (ua.includes('win')) {
      setPlatform('windows');
    } else if (ua.includes('linux')) {
      setPlatform('linux');
    }
  }, []);

  return platform;
}

export function useModifierKey(): string {
  const platform = usePlatform();
  return platform === 'mac' ? '\u2318' : 'Ctrl';
}
