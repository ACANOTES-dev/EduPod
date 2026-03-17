'use client';

import * as React from 'react';
import { Toaster } from 'sonner';

export function ToastProvider() {
  const [position, setPosition] = React.useState<'bottom-right' | 'bottom-left'>('bottom-right');

  React.useEffect(() => {
    function update() {
      const dir = document.documentElement.dir;
      setPosition(dir === 'rtl' ? 'bottom-left' : 'bottom-right');
    }
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    return () => observer.disconnect();
  }, []);

  return (
    <Toaster
      position={position}
      toastOptions={{
        className: 'bg-surface border border-border text-text-primary rounded-2xl shadow-md',
        duration: 5000,
      }}
      visibleToasts={3}
      richColors
    />
  );
}
