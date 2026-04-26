'use client';

import * as React from 'react';

/**
 * Smoothly interpolate from the previous render's value to the next
 * via `requestAnimationFrame`. Honours `prefers-reduced-motion` — when
 * set, we snap immediately to avoid simulated movement.
 */
export function useAnimatedNumber(target: number, durationMs = 300): number {
  const [value, setValue] = React.useState<number>(target);
  const fromRef = React.useRef<number>(target);
  const startedAtRef = React.useRef<number | null>(null);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      setValue(target);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(target) || !Number.isFinite(fromRef.current)) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    const from = fromRef.current;
    startedAtRef.current = performance.now();

    const tick = (now: number): void => {
      const startedAt = startedAtRef.current ?? now;
      const elapsed = now - startedAt;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (target - from) * eased;
      setValue(current);
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, durationMs]);

  return value;
}
