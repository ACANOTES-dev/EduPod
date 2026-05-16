'use client';

import * as React from 'react';

import { Button } from '@school/ui';

export interface PushSubscriptionConfig {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

interface PushSubscriptionProps {
  onSubscription: (config: PushSubscriptionConfig) => void;
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return buffer;
}

export function PushSubscription({ onSubscription }: PushSubscriptionProps) {
  const [status, setStatus] = React.useState('Not requested');
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  async function requestSubscription() {
    try {
      if (!supported) {
        setStatus('Not supported');
        return;
      }
      if (!publicKey) {
        setStatus('VAPID public key missing');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('Permission denied');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw-push.js');
      const subscription = await registration.pushManager.subscribe({
        applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        userVisibleOnly: true,
      });
      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        setStatus('Subscription unavailable');
        return;
      }

      onSubscription({ endpoint, keys: { auth, p256dh } });
      setStatus('Permission granted');
    } catch (err: unknown) {
      console.error('[PushSubscription.requestSubscription]', err);
      setStatus('Subscription failed');
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-secondary p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-text-secondary">{status}</span>
        <Button type="button" variant="outline" onClick={() => void requestSubscription()}>
          Request permission
        </Button>
      </div>
    </div>
  );
}
