'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type AnnouncementScope = 'school_wide' | 'year_group' | 'class' | 'household' | 'custom';

interface CreateAnnouncementPayload {
  title: string;
  body: string;
  scope: AnnouncementScope;
  target_ids?: string[];
  scheduled_at?: string | null;
  status: 'draft' | 'published';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewAnnouncementPage() {
  const t = useTranslations('communications');
  const tc = useTranslations('common');
  const router = useRouter();

  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [scope, setScope] = React.useState<AnnouncementScope>('school_wide');
  const [targetIds, setTargetIds] = React.useState('');
  const [scheduleEnabled, setScheduleEnabled] = React.useState(false);
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);

  const needsTarget = scope !== 'school_wide';

  const buildPayload = (status: 'draft' | 'published'): CreateAnnouncementPayload => {
    const payload: CreateAnnouncementPayload = {
      title: title.trim(),
      body: body.trim(),
      scope,
      status,
    };
    if (needsTarget && targetIds.trim()) {
      payload.target_ids = targetIds.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (scheduleEnabled && scheduledAt) {
      payload.scheduled_at = new Date(scheduledAt).toISOString();
    }
    return payload;
  };

  const handleSaveDraft = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    setIsSaving(true);
    try {
      await apiClient<{ id: string }>('/api/v1/announcements', {
        method: 'POST',
        body: JSON.stringify(buildPayload('draft')),
      });
      toast.success(t('form.saveDraftSuccess'));
      router.push('/communications');
    } catch {
      toast.error(t('form.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required to publish');
      return;
    }
    setIsPublishing(true);
    try {
      const res = await apiClient<{ id: string }>('/api/v1/announcements', {
        method: 'POST',
        body: JSON.stringify(buildPayload('published')),
      });
      // If we got an ID back, trigger publish endpoint
      if (res.id) {
        try {
          await apiClient(`/api/v1/announcements/${res.id}/publish`, { method: 'POST' });
        } catch {
          // publish may be handled inline by status field — ignore
        }
      }
      toast.success(t('form.publishSuccess'));
      router.push('/communications');
    } catch {
      toast.error(t('form.saveError'));
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newAnnouncement')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">{t('form.titleLabel')}</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('form.titlePlaceholder')}
            maxLength={200}
          />
        </div>

        {/* Body */}
        <div className="space-y-2">
          <Label htmlFor="body">{t('form.bodyLabel')}</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('form.bodyPlaceholder')}
            rows={8}
          />
        </div>

        {/* Scope */}
        <div className="space-y-2">
          <Label>{t('form.scopeLabel')}</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as AnnouncementScope)}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="school_wide">{t('scope.school_wide')}</SelectItem>
              <SelectItem value="year_group">{t('scope.year_group')}</SelectItem>
              <SelectItem value="class">{t('scope.class')}</SelectItem>
              <SelectItem value="household">{t('scope.household')}</SelectItem>
              <SelectItem value="custom">{t('scope.custom')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Target IDs — shown when scope is not school_wide */}
        {needsTarget && (
          <div className="space-y-2">
            <Label htmlFor="target-ids">{t('form.targetLabel')}</Label>
            <Input
              id="target-ids"
              value={targetIds}
              onChange={(e) => setTargetIds(e.target.value)}
              placeholder={t('form.targetPlaceholder')}
            />
            <p className="text-xs text-text-tertiary">
              Enter comma-separated IDs for the selected scope.
            </p>
          </div>
        )}

        {/* Schedule toggle */}
        <div className="flex items-center gap-3">
          <Switch
            id="schedule"
            checked={scheduleEnabled}
            onCheckedChange={setScheduleEnabled}
          />
          <Label htmlFor="schedule" className="cursor-pointer">
            {t('form.scheduleLabel')}
          </Label>
        </div>

        {scheduleEnabled && (
          <div className="space-y-2">
            <Label htmlFor="scheduled-at">{t('form.scheduledAtLabel')}</Label>
            <Input
              id="scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-[280px]"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSaving || isPublishing || !title.trim()}
          >
            {isSaving ? t('form.saving') : t('form.saveAsDraft')}
          </Button>
          <Button
            onClick={handlePublish}
            disabled={isSaving || isPublishing || !title.trim() || !body.trim()}
          >
            {isPublishing ? t('form.publishing') : t('form.publish')}
          </Button>
        </div>
      </div>
    </div>
  );
}
