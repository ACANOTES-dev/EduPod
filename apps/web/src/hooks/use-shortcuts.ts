'use client';

import { useEffect } from 'react';

import { useShortcutContext } from '@/providers/shortcut-provider';

interface ShortcutDef {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
}

export function useShortcuts(shortcuts: ShortcutDef[]) {
  const { registerShortcut, deregisterShortcut } = useShortcutContext();

  useEffect(() => {
    const ids: string[] = [];
    shortcuts.forEach((shortcut, index) => {
      const id = `shortcut-${shortcut.key}-${index}-${Date.now()}`;
      ids.push(id);
      registerShortcut(id, shortcut);
    });

    return () => {
      ids.forEach((id) => deregisterShortcut(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
