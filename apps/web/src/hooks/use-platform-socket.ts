'use client';

import * as React from 'react';

import { PlatformSocketContext } from '@/providers/platform-socket-provider';

export function usePlatformSocket() {
  const context = React.useContext(PlatformSocketContext);
  if (!context) {
    throw new Error('usePlatformSocket must be used within PlatformSocketProvider');
  }
  return context;
}
