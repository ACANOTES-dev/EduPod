'use client';

import * as React from 'react';
import { io, Socket } from 'socket.io-client';

import { ACCESS_TOKEN_CHANGED_EVENT, getAccessToken } from '@/lib/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface PlatformSocketContextValue {
  connected: boolean;
  subscribe: (event: string, callback: (data: unknown) => void) => () => void;
}

export const PlatformSocketContext = React.createContext<PlatformSocketContextValue | null>(null);

function isAuthConnectError(error: Error & { data?: unknown }): boolean {
  if (error.message === 'AUTH_FAILED') {
    return true;
  }

  if (error.data !== null && typeof error.data === 'object' && !Array.isArray(error.data)) {
    const data = error.data as Record<string, unknown>;
    return data.message === 'AUTH_FAILED';
  }

  return false;
}

export function PlatformSocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = React.useRef<Socket | null>(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    function createSocket(token: string): Socket {
      const socket = io(`${API_URL}/platform`, {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket'],
      });

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', (error) => {
        setConnected(false);
        if (isAuthConnectError(error)) {
          socket.io.opts.reconnection = false;
          socket.disconnect();
        }
      });

      return socket;
    }

    const initialToken = getAccessToken();
    if (initialToken) {
      socketRef.current = createSocket(initialToken);
    }

    function handleTokenChanged() {
      const token = getAccessToken();
      const socket = socketRef.current;

      if (!token) {
        socket?.disconnect();
        socketRef.current = null;
        setConnected(false);
        return;
      }

      if (!socket) {
        socketRef.current = createSocket(token);
        return;
      }

      socket.auth = { token };
      socket.io.opts.reconnection = true;
      if (!socket.connected) {
        socket.connect();
      }
    }

    window.addEventListener(ACCESS_TOKEN_CHANGED_EVENT, handleTokenChanged);

    return () => {
      window.removeEventListener(ACCESS_TOKEN_CHANGED_EVENT, handleTokenChanged);
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, []);

  const subscribe = React.useCallback(
    (event: string, callback: (data: unknown) => void): (() => void) => {
      const socket = socketRef.current;
      if (!socket) {
        return () => undefined;
      }

      socket.on(event, callback);
      return () => {
        socket.off(event, callback);
      };
    },
    [],
  );

  const value = React.useMemo<PlatformSocketContextValue>(
    () => ({
      connected,
      subscribe,
    }),
    [connected, subscribe],
  );

  return <PlatformSocketContext.Provider value={value}>{children}</PlatformSocketContext.Provider>;
}
