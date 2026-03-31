/**
 * Unit tests for NotificationPanel — pure helper functions.
 *
 * NotificationPanel has three testable pure helpers:
 *   - formatRelativeTime: converts a date string to a human-readable relative time
 *   - groupNotifications: buckets notifications into Today/Yesterday/Earlier
 *   - getNotificationTitle: derives a display title from the notification payload
 *
 * We replicate these helpers here so they can be tested without mounting React
 * or making API calls.
 */

// ─── Types (mirrored) ─────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  channel: string;
  template_key: string | null;
  status: string;
  payload_json: Record<string, unknown>;
  source_entity_type: string | null;
  source_entity_id: string | null;
  created_at: string;
  read_at: string | null;
}

// ─── Pure helpers (mirrored from notification-panel.tsx) ──────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

function groupNotifications(
  notifications: NotificationItem[],
): { label: string; items: NotificationItem[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayGroup: { label: string; items: NotificationItem[] } = { label: 'Today', items: [] };
  const yesterdayGroup: { label: string; items: NotificationItem[] } = {
    label: 'Yesterday',
    items: [],
  };
  const earlierGroup: { label: string; items: NotificationItem[] } = {
    label: 'Earlier',
    items: [],
  };

  for (const n of notifications) {
    const date = new Date(n.created_at);
    if (date >= today) {
      todayGroup.items.push(n);
    } else if (date >= yesterday) {
      yesterdayGroup.items.push(n);
    } else {
      earlierGroup.items.push(n);
    }
  }

  return [todayGroup, yesterdayGroup, earlierGroup].filter((g) => g.items.length > 0);
}

function getNotificationTitle(n: NotificationItem): string {
  const p = n.payload_json;
  switch (n.template_key) {
    case 'announcement.published':
      return `New announcement: ${String(p.announcement_title ?? 'Untitled')}`;
    case 'inquiry.new_message':
      return `New inquiry message${p.inquiry_subject ? `: ${String(p.inquiry_subject)}` : ''}`;
    case 'approval.requested':
      return 'New approval request';
    case 'approval.decided':
      return 'Approval decision made';
    default:
      return n.template_key ?? 'Notification';
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'notif-1',
    channel: 'in_app',
    template_key: null,
    status: 'unread',
    payload_json: {},
    source_entity_type: null,
    source_entity_id: null,
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NotificationPanel — helper functions', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── formatRelativeTime ───────────────────────────────────────────────────

  describe('formatRelativeTime', () => {
    it('should return "Just now" for a date less than 1 minute ago', () => {
      const date = new Date(Date.now() - 30_000); // 30 seconds ago
      expect(formatRelativeTime(date.toISOString())).toBe('Just now');
    });

    it('should return "Xm ago" for a date less than 60 minutes ago', () => {
      const date = new Date(Date.now() - 15 * 60_000); // 15 minutes ago
      expect(formatRelativeTime(date.toISOString())).toBe('15m ago');
    });

    it('should return "Xh ago" for a date less than 24 hours ago', () => {
      const date = new Date(Date.now() - 3 * 3_600_000); // 3 hours ago
      expect(formatRelativeTime(date.toISOString())).toBe('3h ago');
    });

    it('should return "Yesterday" for exactly 1 day ago', () => {
      const date = new Date(Date.now() - 25 * 3_600_000); // 25 hours ago
      expect(formatRelativeTime(date.toISOString())).toBe('Yesterday');
    });

    it('should return "Xd ago" for more than 1 day ago', () => {
      const date = new Date(Date.now() - 3 * 86_400_000); // 3 days ago
      expect(formatRelativeTime(date.toISOString())).toBe('3d ago');
    });
  });

  // ─── groupNotifications ───────────────────────────────────────────────────

  describe('groupNotifications', () => {
    it('should return an empty array for no notifications', () => {
      expect(groupNotifications([])).toEqual([]);
    });

    it('should group a recent notification into Today', () => {
      const n = makeNotification({ created_at: new Date().toISOString() });
      const groups = groupNotifications([n]);
      expect(groups).toHaveLength(1);
      expect(groups[0]?.label).toBe('Today');
      expect(groups[0]?.items).toHaveLength(1);
    });

    it('should group a notification from yesterday into Yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(10, 0, 0, 0);
      const n = makeNotification({ created_at: yesterday.toISOString() });
      const groups = groupNotifications([n]);
      expect(groups[0]?.label).toBe('Yesterday');
    });

    it('should group an older notification into Earlier', () => {
      const older = new Date(Date.now() - 3 * 86_400_000);
      const n = makeNotification({ created_at: older.toISOString() });
      const groups = groupNotifications([n]);
      expect(groups[0]?.label).toBe('Earlier');
    });

    it('should omit empty groups', () => {
      const n = makeNotification({ created_at: new Date().toISOString() });
      const groups = groupNotifications([n]);
      const labels = groups.map((g) => g.label);
      expect(labels).not.toContain('Yesterday');
      expect(labels).not.toContain('Earlier');
    });

    it('should return multiple groups when notifications span different days', () => {
      const todayNotif = makeNotification({ id: '1', created_at: new Date().toISOString() });
      const oldNotif = makeNotification({
        id: '2',
        created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      });
      const groups = groupNotifications([todayNotif, oldNotif]);
      expect(groups).toHaveLength(2);
    });
  });

  // ─── getNotificationTitle ─────────────────────────────────────────────────

  describe('getNotificationTitle', () => {
    it('should include announcement title for announcement.published', () => {
      const n = makeNotification({
        template_key: 'announcement.published',
        payload_json: { announcement_title: 'School Trip' },
      });
      expect(getNotificationTitle(n)).toBe('New announcement: School Trip');
    });

    it('should use "Untitled" when announcement title is missing', () => {
      const n = makeNotification({
        template_key: 'announcement.published',
        payload_json: {},
      });
      expect(getNotificationTitle(n)).toBe('New announcement: Untitled');
    });

    it('should include inquiry subject for inquiry.new_message when present', () => {
      const n = makeNotification({
        template_key: 'inquiry.new_message',
        payload_json: { inquiry_subject: 'Fee query' },
      });
      expect(getNotificationTitle(n)).toBe('New inquiry message: Fee query');
    });

    it('should return base message for inquiry.new_message without subject', () => {
      const n = makeNotification({
        template_key: 'inquiry.new_message',
        payload_json: {},
      });
      expect(getNotificationTitle(n)).toBe('New inquiry message');
    });

    it('should return fixed label for approval.requested', () => {
      const n = makeNotification({ template_key: 'approval.requested', payload_json: {} });
      expect(getNotificationTitle(n)).toBe('New approval request');
    });

    it('should return fixed label for approval.decided', () => {
      const n = makeNotification({ template_key: 'approval.decided', payload_json: {} });
      expect(getNotificationTitle(n)).toBe('Approval decision made');
    });

    it('should return the template_key as fallback for unknown keys', () => {
      const n = makeNotification({ template_key: 'custom.event', payload_json: {} });
      expect(getNotificationTitle(n)).toBe('custom.event');
    });

    it('should return "Notification" when template_key is null', () => {
      const n = makeNotification({ template_key: null, payload_json: {} });
      expect(getNotificationTitle(n)).toBe('Notification');
    });
  });
});
