'use client';

import { Archive, ArrowLeft, Send } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, StatusBadge, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';

const SCOPE_LABELS: Record<string, string> = {
  school_wide: 'School-wide',
  year_group: 'Year Group',
  class: 'Class',
  household: 'Household',
  custom: 'Custom',
};

interface DeliveryStats {
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  read: number;
}

interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  scope: string;
  target_ids: string[] | null;
  status: AnnouncementStatus;
  published_at: string | null;
  scheduled_at: string | null;
  author_name: string;
  created_at: string;
  delivery_stats: DeliveryStats | null;
}

const STATUS_VARIANT: Record<AnnouncementStatus, 'neutral' | 'info' | 'warning' | 'success'> = {
  draft: 'neutral',
  scheduled: 'warning',
  published: 'success',
  archived: 'neutral',
};

// ─── Delivery Stats Panel ─────────────────────────────────────────────────────

function DeliveryPanel({ stats }: { stats: DeliveryStats }) {
  const t = useTranslations('communications');
  const items = [
    { label: t('detail.queued'), value: stats.queued, colour: 'text-text-secondary' },
    { label: t('detail.sent'), value: stats.sent, colour: 'text-info-text' },
    { label: t('detail.delivered'), value: stats.delivered, colour: 'text-success-text' },
    { label: t('detail.failed'), value: stats.failed, colour: 'text-danger-text' },
    { label: t('detail.read'), value: stats.read, colour: 'text-primary-600' },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">{t('detail.deliveryStatus')}</h2>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
        {items.map(({ label, value, colour }) => (
          <div key={label} className="text-center">
            <p className={`text-2xl font-bold ${colour}`}>{value}</p>
            <p className="mt-1 text-xs text-text-tertiary">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnnouncementDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('communications');
  const tc = useTranslations('common');
  const router = useRouter();

  const [announcement, setAnnouncement] = React.useState<AnnouncementDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Editable fields for draft state
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');

  const fetchAnnouncement = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient<{ data: AnnouncementDetail }>(`/api/v1/announcements/${id}`);
      setAnnouncement(res.data);
      setTitle(res.data.title);
      setBody(res.data.body ?? '');
    } catch {
      toast.error('Failed to load announcement');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchAnnouncement();
  }, [fetchAnnouncement]);

  const handleSave = async () => {
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/announcements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      toast.success(t('detail.saveSuccess'));
      void fetchAnnouncement();
    } catch {
      toast.error(t('detail.saveError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async () => {
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/announcements/${id}/publish`, { method: 'POST' });
      toast.success(t('detail.publishSuccess'));
      void fetchAnnouncement();
    } catch {
      toast.error(t('detail.publishError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/announcements/${id}/archive`, { method: 'POST' });
      toast.success(t('detail.archiveSuccess'));
      router.push('/communications');
    } catch {
      toast.error(t('detail.archiveError'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!announcement) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{t('detail.notFound')}</p>
      </div>
    );
  }

  const isDraft = announcement.status === 'draft';
  const isPublished = announcement.status === 'published';
  const isArchived = announcement.status === 'archived';

  return (
    <div className="space-y-6">
      <PageHeader
        title={announcement.title}
        description={`By ${announcement.author_name} · ${new Date(announcement.created_at).toLocaleDateString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
            </Button>
            {!isArchived && (
              <Button
                variant="outline"
                onClick={handleArchive}
                disabled={actionLoading}
              >
                <Archive className="me-2 h-4 w-4" />
                Archive
              </Button>
            )}
            {isDraft && (
              <>
                <Button variant="outline" onClick={handleSave} disabled={actionLoading}>
                  {tc('save')}
                </Button>
                <Button onClick={handlePublish} disabled={actionLoading || !title.trim() || !body.trim()}>
                  <Send className="me-2 h-4 w-4" />
                  {t('form.publish')}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Status badge row */}
      <div className="flex items-center gap-3">
        <StatusBadge status={STATUS_VARIANT[announcement.status]} dot>
          {announcement.status.charAt(0).toUpperCase() + announcement.status.slice(1)}
        </StatusBadge>
        {announcement.published_at && (
          <span className="text-sm text-text-secondary">
            Published {new Date(announcement.published_at).toLocaleString()}
          </span>
        )}
        {announcement.scheduled_at && !announcement.published_at && (
          <span className="text-sm text-text-secondary">
            Scheduled for {new Date(announcement.scheduled_at).toLocaleString()}
          </span>
        )}
        <span className="text-sm text-text-secondary capitalize">
          {SCOPE_LABELS[announcement.scope] ?? announcement.scope}
        </span>
      </div>

      {/* Editable form for draft; read-only for others */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-6">
        {isDraft ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="title">{t('form.titleLabel')}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">{t('form.bodyLabel')}</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
              />
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-text-primary">{announcement.title}</h2>
            <div className="prose prose-sm max-w-none text-text-primary whitespace-pre-wrap">
              {announcement.body}
            </div>
          </>
        )}
      </div>

      {/* Delivery stats — shown only when published */}
      {isPublished && announcement.delivery_stats && (
        <DeliveryPanel stats={announcement.delivery_stats} />
      )}
    </div>
  );
}
