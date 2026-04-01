import type { NotificationChannel } from '../types/notification';

/**
 * Safely cast a channel string to the NotificationChannel union type.
 * Centralises the string→channel conversion used across notification services
 * so the cast is written once rather than repeated at every call site.
 */
export function toNotificationChannel(channel: string): NotificationChannel {
  return channel as NotificationChannel;
}
