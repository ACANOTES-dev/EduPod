'use client';

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SenProfile {
  id: string;
  student_id: string;
  student_name: string;
  year_group_name: string;
  primary_category: string;
  support_level: string;
  is_active: boolean;
  has_active_plan: boolean;
  sen_coordinator_name: string;
}

interface SenProfilesResponse {
  data: SenProfile[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Category and support-level options ───────────────────────────────────────

const SEN_CATEGORY_VALUES = [
  'learning',
  'social_emotional_behavioural',
  'communication_interaction',
  'sensory_physical',
  'autism_spectrum',
  'specific_learning_disability',
  'intellectual_disability',
  'multiple_disabilities',
] as const;

const SUPPORT_LEVELS = ['school_support', 'school_support_plus'] as const;

// ─── Student directory page ───────────────────────────────────────────────────

export default function SenStudentsPage() {
  const t = useTranslations('sen');
  const router = useRouter();
  const locale = useLocale();

  const [data, setData] = React.useState<SenProfile[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const pageSize = 20;

  // Filters
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [supportLevel, setSupportLevel] = React.useState('all');
  const [activeFilter, setActiveFilter] = React.useState('active');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, supportLevel, activeFilter]);

  // ─── Fetch profiles ───────────────────────────────────────────────────────

  React.useEffect(() => {
    let cancelled = false;

    async function fetchProfiles() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });

        if (debouncedSearch) params.set('search', debouncedSearch);
        if (category !== 'all') params.set('primary_category', category);
        if (supportLevel !== 'all') params.set('support_level', supportLevel);
        if (activeFilter !== 'all')
          params.set('is_active', activeFilter === 'active' ? 'true' : 'false');

        const res = await apiClient<SenProfilesResponse>(
          `/api/v1/sen/profiles?${params.toString()}`,
        );

        if (!cancelled) {
          setData(res.data);
          setTotal(res.meta.total);
        }
      } catch (err) {
        console.error('[SenStudentsPage] fetchProfiles', err);
        if (!cancelled) {
          setData([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchProfiles();
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, category, supportLevel, activeFilter]);

  // ─── Table columns ────────────────────────────────────────────────────────

  const columns = React.useMemo(
    () => [
      {
        key: 'student_name',
        header: t('students.name'),
        render: (row: SenProfile) => (
          <span className="font-medium text-primary-700 hover:underline">{row.student_name}</span>
        ),
      },
      {
        key: 'year_group',
        header: t('students.yearGroup'),
        render: (row: SenProfile) => row.year_group_name || '—',
      },
      {
        key: 'primary_category',
        header: t('students.primaryCategory'),
        render: (row: SenProfile) => t(`category.${row.primary_category}`),
      },
      {
        key: 'support_level',
        header: t('students.supportLevel'),
        render: (row: SenProfile) => t(`supportLevel.${row.support_level}`),
      },
      {
        key: 'active_plan',
        header: t('students.activePlan'),
        render: (row: SenProfile) => (
          <StatusBadge status={row.has_active_plan ? 'success' : 'neutral'}>
            {row.has_active_plan ? t('students.hasPlan') : t('students.noPlan')}
          </StatusBadge>
        ),
      },
      {
        key: 'coordinator',
        header: t('students.coordinator'),
        render: (row: SenProfile) => row.sen_coordinator_name || '—',
      },
    ],
    [t],
  );

  // ─── Navigation ───────────────────────────────────────────────────────────

  const handleRowClick = React.useCallback(
    (row: SenProfile) => {
      router.push(`/${locale}/sen/students/${row.student_id}`);
    },
    [router, locale],
  );

  // ─── Filter toolbar ───────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative w-full sm:w-64">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('students.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      {/* Category filter */}
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={t('students.allCategories')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('students.allCategories')}</SelectItem>
          {SEN_CATEGORY_VALUES.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {t(`category.${cat}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Support level filter */}
      <Select value={supportLevel} onValueChange={setSupportLevel}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={t('students.allLevels')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('students.allLevels')}</SelectItem>
          {SUPPORT_LEVELS.map((level) => (
            <SelectItem key={level} value={level}>
              {t(`supportLevel.${level}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Active status filter */}
      <Select value={activeFilter} onValueChange={setActiveFilter}>
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder={t('students.statusAll')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('students.statusAll')}</SelectItem>
          <SelectItem value="active">{t('students.statusActive')}</SelectItem>
          <SelectItem value="inactive">{t('students.statusInactive')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('students.title')} description={t('students.description')} />

      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onRowClick={handleRowClick}
        keyExtractor={(row) => row.id}
        isLoading={loading}
      />
    </div>
  );
}
