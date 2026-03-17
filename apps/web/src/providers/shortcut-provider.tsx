'use client';

import * as React from 'react';

interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
}

interface ShortcutContextValue {
  registerShortcut: (id: string, shortcut: Shortcut) => void;
  deregisterShortcut: (id: string) => void;
}

const ShortcutContext = React.createContext<ShortcutContextValue | null>(null);

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const shortcuts = React.useRef<Map<string, Shortcut>>(new Map());

  const registerShortcut = React.useCallback((id: string, shortcut: Shortcut) => {
    shortcuts.current.set(id, shortcut);
  }, []);

  const deregisterShortcut = React.useCallback((id: string) => {
    shortcuts.current.delete(id);
  }, []);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      for (const shortcut of shortcuts.current.values()) {
        const metaMatch = shortcut.meta ? (e.metaKey || e.ctrlKey) : true;
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : true;
        const shiftMatch = shortcut.shift != null ? (shortcut.shift ? e.shiftKey : !e.shiftKey) : true;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (metaMatch && ctrlMatch && shiftMatch && keyMatch) {
          e.preventDefault();
          shortcut.handler();
          return;
        }
      }

      // Global Escape handler
      if (e.key === 'Escape') {
        // Let it bubble — individual components handle Escape
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = React.useMemo(
    () => ({ registerShortcut, deregisterShortcut }),
    [registerShortcut, deregisterShortcut],
  );

  return <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>;
}

export function useShortcutContext() {
  const context = React.useContext(ShortcutContext);
  if (!context) {
    throw new Error('useShortcutContext must be used within ShortcutProvider');
  }
  return context;
}
