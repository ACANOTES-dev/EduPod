'use client';

import { useEffect } from 'react';

export function SwRegister() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV !== 'production'
    ) {
      return;
    }

    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'activated' &&
              navigator.serviceWorker.controller
            ) {
              // New version available — the user will see updated content on next navigation
            }
          });
        });
      })
      .catch((err: unknown) => {
        console.error('[SwRegister]', err);
      });
  }, []);

  return null;
}
