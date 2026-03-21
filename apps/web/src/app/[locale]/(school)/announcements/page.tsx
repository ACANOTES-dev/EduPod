'use client';

import { EmptyState } from '@school/ui';
import { Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string;
  title: string;
  body: string;
  scope: string;
  published_at: string;
  author_name: string;
}

// ─── Announcement Card ────────────────────────────────────────────────────────

function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  const t = useTranslations('announcements');
  // Truncate body to 200 chars for preview
  const preview =
    announcement.body.length > 200
      ? announcement.body.slice(0, 200) + '…'
      : announcement.body;

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-text-primary leading-snug">
          {announcement.title}
        </h2>
        <time
          dateTime={announcement.published_at}
          className="shrink-0 text-xs text-text-tertiary"
        >
          {new Date(announcement.published_at).toLocaleDateString()}
        </time>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">{preview}</p>
      <p className="text-xs text-text-tertiary">
        {t('publishedAt')} by {announcement.author_name}
      </p>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentAnnouncementsPage() {
  const t = useTranslations('announcements');

  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchAnnouncements = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: Announcement[] }>('/api/v1/announcements/my');
      setAnnouncements(res.data);
    } catch {
      setAnnouncements([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={t('noAnnouncements')}
          description={t('noAnnouncementsDesc')}
        />
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
        </div>
      )}
    </div>
  );
}
