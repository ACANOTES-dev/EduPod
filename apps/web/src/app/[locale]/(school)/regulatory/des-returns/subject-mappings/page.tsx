'use client';

import { Plus, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { type CreateDesSubjectCodeMappingDto } from '@school/shared/regulatory';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { SubjectMappingDialog } from '../_components/subject-mapping-dialog';
import { SubjectMappingTable } from '../_components/subject-mapping-table';
import type { SubjectMapping } from '../_components/subject-mapping-table';

// ─── Types ──────────────────────────────────────────────────────────────────

type VerifiedFilter = 'all' | 'verified' | 'unverified';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SubjectMappingsPage() {
  const t = useTranslations('regulatory.desReturns');
  const locale = useLocale();

  const [mappings, setMappings] = React.useState<SubjectMapping[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [search, setSearch] = React.useState('');
  const [verifiedFilter, setVerifiedFilter] = React.useState<VerifiedFilter>('all');

  // ─── Fetch mappings ──────────────────────────────────────────────────────
  const fetchMappings = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: SubjectMapping[] } | SubjectMapping[]>(
        '/api/v1/regulatory/des/subject-mappings',
        { silent: true },
      );
      const inner =
        res && typeof res === 'object' && !Array.isArray(res) && 'data' in res
          ? res.data
          : (res as SubjectMapping[]);
      setMappings(Array.isArray(inner) ? inner : []);
    } catch (err) {
      console.error('[SubjectMappingsPage.fetchMappings]', err);
      setMappings([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchMappings();
  }, [fetchMappings]);

  // ─── Create mapping ──────────────────────────────────────────────────────
  async function handleCreate(values: CreateDesSubjectCodeMappingDto) {
    setIsSubmitting(true);
    try {
      await apiClient('/api/v1/regulatory/des/subject-mappings', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success(t('mappingCreated'));
      setIsDialogOpen(false);
      void fetchMappings();
    } catch (err) {
      console.error('[SubjectMappingsPage.handleCreate]', err);
      toast.error(t('mappingCreateFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Delete mapping ──────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/v1/regulatory/des/subject-mappings/${id}`, { method: 'DELETE' });
      toast.success(t('mappingDeleted'));
      void fetchMappings();
    } catch (err) {
      console.error('[SubjectMappingsPage.handleDelete]', err);
      toast.error(t('mappingDeleteFailed'));
    }
  }

  // ─── Filter mappings ─────────────────────────────────────────────────────
  const filteredMappings = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return mappings.filter((row) => {
      if (verifiedFilter === 'verified' && !row.is_verified) return false;
      if (verifiedFilter === 'unverified' && row.is_verified) return false;
      if (!needle) return true;
      const hay =
        `${row.subject?.name ?? ''} ${row.des_code} ${row.des_name} ${row.des_level ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [mappings, search, verifiedFilter]);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('subjectMappingsTitle')}
        description={t('subjectMappingsDescription')}
        back={{ href: `/${locale}/regulatory/des-returns`, label: t('backToDesReturns') }}
        actions={
          <Button
            size="sm"
            onClick={() => setIsDialogOpen(true)}
            className="min-h-[44px] bg-teal-600 text-white hover:bg-teal-700"
          >
            <Plus className="me-1.5 h-4 w-4" aria-hidden="true" />
            {t('addMapping')}
          </Button>
        }
      />

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-primary p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchMappingsPlaceholder')}
            className="min-h-[44px] w-full ps-9 text-base"
            aria-label={t('searchMappingsPlaceholder')}
          />
        </div>
        <Select
          value={verifiedFilter}
          onValueChange={(v) => setVerifiedFilter(v as VerifiedFilter)}
        >
          <SelectTrigger className="min-h-[44px] w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filter.all')}</SelectItem>
            <SelectItem value="verified">{t('filter.verifiedOnly')}</SelectItem>
            <SelectItem value="unverified">{t('filter.unverifiedOnly')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Mappings table ──────────────────────────────────────────────── */}
      <SubjectMappingTable data={filteredMappings} onDelete={handleDelete} isLoading={isLoading} />

      {/* ── Create dialog ───────────────────────────────────────────────── */}
      <SubjectMappingDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleCreate}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
