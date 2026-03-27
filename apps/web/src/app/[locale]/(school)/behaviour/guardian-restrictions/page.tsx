'use client';

import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@school/ui';
import {
  Ban,
  Plus,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RestrictionRow {
  id: string;
  restriction_type: string;
  legal_basis: string | null;
  reason: string;
  effective_from: string;
  effective_until: string | null;
  review_date: string | null;
  status: string;
  revoke_reason: string | null;
  revoked_at: string | null;
  created_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  parent: {
    id: string;
    first_name: string;
    last_name: string;
    user?: {
      id: string;
      first_name: string;
      last_name: string;
    } | null;
  } | null;
  set_by?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  approved_by?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  revoked_by?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  history?: HistoryEntry[];
}

interface HistoryEntry {
  id: string;
  action: string;
  performed_by_id: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

interface RestrictionsResponse {
  data: RestrictionRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface ParentOption {
  id: string;
  first_name: string;
  last_name: string;
  relationship_label?: string | null;
}

interface StudentDetailResponse {
  data: {
    id: string;
    student_parents: Array<{
      relationship_label: string | null;
      parent: {
        id: string;
        first_name: string;
        last_name: string;
      };
    }>;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESTRICTION_TYPE_LABELS: Record<string, string> = {
  no_behaviour_visibility: 'No Behaviour Visibility',
  no_behaviour_notifications: 'No Behaviour Notifications',
  no_portal_access: 'No Portal Access',
  no_communications: 'No Communications',
};

const STATUS_LABELS: Record<string, string> = {
  active_restriction: 'Active',
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  superseded_restriction: 'Superseded',
  superseded: 'Superseded',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  active_restriction: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  active: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  revoked: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  superseded_restriction: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  superseded: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  no_behaviour_visibility: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  no_behaviour_notifications: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  no_portal_access: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  no_communications: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const DEFAULT_TYPE_BADGE = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

const RESTRICTION_TYPES = [
  'no_behaviour_visibility',
  'no_behaviour_notifications',
  'no_portal_access',
  'no_communications',
] as const;

// ─── Helper Components ────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TYPE_BADGE_CLASSES[type] ?? DEFAULT_TYPE_BADGE
      }`}
    >
      {RESTRICTION_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_BADGE_CLASSES[status] ?? DEFAULT_TYPE_BADGE
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function getParentDisplayName(
  parent: RestrictionRow['parent'],
): string {
  if (!parent) return '\u2014';
  // Prefer the user name (the actual account name), fall back to parent record name
  if (parent.user) {
    return `${parent.user.first_name} ${parent.user.last_name}`;
  }
  return `${parent.first_name} ${parent.last_name}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuardianRestrictionsPage() {
  const t = useTranslations('behaviour.guardianRestrictions');
  // ─── List State ───────────────────────────────────────────────────
  const [data, setData] = React.useState<RestrictionRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');

  // Mobile detection
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ─── Create Sheet State ───────────────────────────────────────────
  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // Student search
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentOption | null>(null);
  const studentSearchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parent selection (based on selected student)
  const [parentOptions, setParentOptions] = React.useState<ParentOption[]>([]);
  const [loadingParents, setLoadingParents] = React.useState(false);
  const [selectedParentId, setSelectedParentId] = React.useState('');

  // Form fields
  const [formType, setFormType] = React.useState<string>('');
  const [formReason, setFormReason] = React.useState('');
  const [formLegalBasis, setFormLegalBasis] = React.useState('');
  const [formEffectiveFrom, setFormEffectiveFrom] = React.useState('');
  const [formEffectiveUntil, setFormEffectiveUntil] = React.useState('');
  const [formReviewDate, setFormReviewDate] = React.useState('');

  // ─── Detail Sheet State ───────────────────────────────────────────
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailData, setDetailData] = React.useState<RestrictionRow | null>(null);

  // ─── Revoke State ─────────────────────────────────────────────────
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [revokeId, setRevokeId] = React.useState<string | null>(null);
  const [revokeReason, setRevokeReason] = React.useState('');
  const [revoking, setRevoking] = React.useState(false);

  // ─── Fetch Restrictions ───────────────────────────────────────────

  const fetchRestrictions = React.useCallback(
    async (p: number, status: string, type: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
        });
        if (status !== 'all') params.set('status', status);
        const res = await apiClient<RestrictionsResponse>(
          `/api/v1/behaviour/guardian-restrictions?${params.toString()}`,
        );
        // Client-side type filter (the API doesn't support type filter directly)
        let items = res.data ?? [];
        if (type !== 'all') {
          items = items.filter((r) => r.restriction_type === type);
        }
        setData(items);
        setTotal(type !== 'all' ? items.length : (res.meta?.total ?? 0));
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchRestrictions(page, statusFilter, typeFilter);
  }, [page, statusFilter, typeFilter, fetchRestrictions]);

  // ─── Student Search ───────────────────────────────────────────────

  React.useEffect(() => {
    if (studentSearch.length < 2) {
      setStudentResults([]);
      return;
    }
    if (studentSearchTimeout.current) clearTimeout(studentSearchTimeout.current);
    studentSearchTimeout.current = setTimeout(() => {
      apiClient<{ data: StudentOption[] }>(
        `/api/v1/students?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
      )
        .then((res) => setStudentResults(res.data ?? []))
        .catch(() => undefined);
    }, 300);
    return () => {
      if (studentSearchTimeout.current) clearTimeout(studentSearchTimeout.current);
    };
  }, [studentSearch]);

  // ─── Load Parents When Student Selected ───────────────────────────

  React.useEffect(() => {
    if (!selectedStudent) {
      setParentOptions([]);
      setSelectedParentId('');
      return;
    }
    setLoadingParents(true);
    apiClient<StudentDetailResponse>(`/api/v1/students/${selectedStudent.id}`)
      .then((res) => {
        const parents = (res.data?.student_parents ?? []).map((sp) => ({
          id: sp.parent.id,
          first_name: sp.parent.first_name,
          last_name: sp.parent.last_name,
          relationship_label: sp.relationship_label,
        }));
        setParentOptions(parents);
        if (parents.length === 1 && parents[0]) {
          setSelectedParentId(parents[0].id);
        }
      })
      .catch(() => setParentOptions([]))
      .finally(() => setLoadingParents(false));
  }, [selectedStudent]);

  // ─── Create Restriction ───────────────────────────────────────────

  function resetCreateForm() {
    setStudentSearch('');
    setStudentResults([]);
    setSelectedStudent(null);
    setParentOptions([]);
    setSelectedParentId('');
    setFormType('');
    setFormReason('');
    setFormLegalBasis('');
    setFormEffectiveFrom('');
    setFormEffectiveUntil('');
    setFormReviewDate('');
  }

  async function handleCreate() {
    if (!selectedStudent || !selectedParentId || !formType || !formReason || !formEffectiveFrom) {
      return;
    }
    setCreating(true);
    try {
      await apiClient('/api/v1/behaviour/guardian-restrictions', {
        method: 'POST',
        body: JSON.stringify({
          student_id: selectedStudent.id,
          parent_id: selectedParentId,
          restriction_type: formType,
          reason: formReason,
          legal_basis: formLegalBasis || null,
          effective_from: formEffectiveFrom,
          effective_until: formEffectiveUntil || null,
          review_date: formReviewDate || null,
        }),
      });
      setCreateOpen(false);
      resetCreateForm();
      void fetchRestrictions(page, statusFilter, typeFilter);
    } catch {
      // Error toast handled by apiClient
    } finally {
      setCreating(false);
    }
  }

  // ─── View Detail ──────────────────────────────────────────────────

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await apiClient<RestrictionRow>(
        `/api/v1/behaviour/guardian-restrictions/${id}`,
      );
      setDetailData(res);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }

  // ─── Revoke ───────────────────────────────────────────────────────

  function openRevoke(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setRevokeId(id);
    setRevokeReason('');
    setRevokeOpen(true);
  }

  async function handleRevoke() {
    if (!revokeId || !revokeReason) return;
    setRevoking(true);
    try {
      await apiClient(`/api/v1/behaviour/guardian-restrictions/${revokeId}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: revokeReason }),
      });
      setRevokeOpen(false);
      setRevokeId(null);
      setRevokeReason('');
      // Refresh both list and detail if open
      void fetchRestrictions(page, statusFilter, typeFilter);
      if (detailOpen && detailData?.id === revokeId) {
        void openDetail(revokeId);
      }
    } catch {
      // Error toast handled by apiClient
    } finally {
      setRevoking(false);
    }
  }

  // ─── DataTable Columns ────────────────────────────────────────────

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (row: RestrictionRow) => (
        <span className="text-sm font-medium text-text-primary">
          {row.student
            ? `${row.student.first_name} ${row.student.last_name}`
            : '\u2014'}
        </span>
      ),
    },
    {
      key: 'parent',
      header: 'Guardian',
      render: (row: RestrictionRow) => (
        <span className="text-sm text-text-primary">
          {getParentDisplayName(row.parent)}
        </span>
      ),
    },
    {
      key: 'restriction_type',
      header: 'Type',
      render: (row: RestrictionRow) => <TypeBadge type={row.restriction_type} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: RestrictionRow) => <StatusBadge status={row.status} />,
    },
    {
      key: 'effective_from',
      header: 'Effective From',
      render: (row: RestrictionRow) => (
        <span className="font-mono text-xs text-text-primary">
          {formatDate(row.effective_from)}
        </span>
      ),
    },
    {
      key: 'effective_until',
      header: 'Effective Until',
      render: (row: RestrictionRow) => (
        <span className="font-mono text-xs text-text-primary">
          {row.effective_until ? formatDate(row.effective_until) : 'Indefinite'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: RestrictionRow) => {
        const isActive = row.status === 'active_restriction' || row.status === 'active';
        return isActive ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => openRevoke(row.id, e)}
            className="shrink-0 text-red-600 hover:text-red-700"
          >
            <Ban className="me-1 h-3.5 w-3.5" />
            Revoke
          </Button>
        ) : null;
      },
    },
  ];

  // ─── Toolbar ──────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={typeFilter}
        onValueChange={(v) => {
          setTypeFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue placeholder="Restriction Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {RESTRICTION_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {RESTRICTION_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="expired">Expired</SelectItem>
          <SelectItem value="revoked">Revoked</SelectItem>
          <SelectItem value="superseded">Superseded</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Mobile Card ──────────────────────────────────────────────────

  const renderMobileCard = (row: RestrictionRow) => {
    const isActive = row.status === 'active_restriction' || row.status === 'active';
    const accentBorder = isActive
      ? 'border-s-red-500'
      : row.status === 'revoked'
        ? 'border-s-amber-500'
        : 'border-s-gray-400';

    return (
      <button
        key={row.id}
        type="button"
        onClick={() => openDetail(row.id)}
        className={`w-full rounded-xl border border-border border-s-4 ${accentBorder} bg-surface p-4 text-start transition-colors hover:bg-surface-secondary dark:bg-surface dark:hover:bg-surface-secondary`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {row.student
                ? `${row.student.first_name} ${row.student.last_name}`
                : t('unknownStudent')}
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              Guardian: {getParentDisplayName(row.parent)}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeBadge type={row.restriction_type} />
          <span className="text-xs text-text-tertiary">
            {formatDate(row.effective_from)}
            {row.effective_until
              ? ` \u2013 ${formatDate(row.effective_until)}`
              : ' \u2013 Indefinite'}
          </span>
        </div>
        {isActive && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-600 hover:text-red-700"
              onClick={(e) => openRevoke(row.id, e)}
            >
              <Ban className="me-1 h-3.5 w-3.5" />
              Revoke
            </Button>
          </div>
        )}
      </button>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────

  const isFormValid =
    !!selectedStudent &&
    !!selectedParentId &&
    !!formType &&
    !!formReason.trim() &&
    !!formEffectiveFrom;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            <Plus className="me-1.5 h-4 w-4" />
            {t('addRestriction')}
          </Button>
        }
      />

      {/* List View */}
      {isMobile ? (
        <div>
          {toolbar}
          <div className="mt-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl bg-surface-secondary"
                />
              ))
            ) : data.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface py-12 text-center dark:bg-surface">
                <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
                <p className="text-sm font-medium text-text-primary">
                  No restrictions found
                </p>
                <p className="mt-1 text-xs text-text-tertiary">
                  No guardian restrictions match the current filters
                </p>
              </div>
            ) : (
              data.map(renderMobileCard)
            )}
          </div>
          {/* Mobile pagination */}
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                Page {page} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => openDetail(row.id)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* ─── Create Restriction Sheet ─────────────────────────────────── */}
      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add Guardian Restriction</SheetTitle>
            <SheetDescription>
              Restrict a guardian&apos;s access to behaviour data for a specific student.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {/* Student Search */}
            <div className="space-y-2">
              <Label>Student *</Label>
              {selectedStudent ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary p-3">
                  <span className="flex-1 text-sm font-medium">
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedStudent(null);
                      setStudentSearch('');
                      setStudentResults([]);
                      setParentOptions([]);
                      setSelectedParentId('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search student by name..."
                    className="ps-9 text-base sm:text-sm"
                  />
                  {studentResults.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                      {studentResults.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full px-4 py-2.5 text-start text-sm hover:bg-surface-secondary"
                          onClick={() => {
                            setSelectedStudent(s);
                            setStudentSearch('');
                            setStudentResults([]);
                          }}
                        >
                          {s.first_name} {s.last_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Parent Picker */}
            <div className="space-y-2">
              <Label>Guardian *</Label>
              {!selectedStudent ? (
                <p className="text-sm text-text-tertiary">
                  Select a student first to see their guardians.
                </p>
              ) : loadingParents ? (
                <div className="h-10 animate-pulse rounded-md bg-surface-secondary" />
              ) : parentOptions.length === 0 ? (
                <p className="text-sm text-text-tertiary">
                  No guardians linked to this student.
                </p>
              ) : (
                <Select
                  value={selectedParentId}
                  onValueChange={setSelectedParentId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select guardian..." />
                  </SelectTrigger>
                  <SelectContent>
                    {parentOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                        {p.relationship_label ? ` (${p.relationship_label})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Restriction Type */}
            <div className="space-y-2">
              <Label>Restriction Type *</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select restriction type..." />
                </SelectTrigger>
                <SelectContent>
                  {RESTRICTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RESTRICTION_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Explain the reason for this restriction..."
                rows={3}
                className="text-base sm:text-sm"
              />
            </div>

            {/* Legal Basis */}
            <div className="space-y-2">
              <Label>Legal Basis</Label>
              <Input
                value={formLegalBasis}
                onChange={(e) => setFormLegalBasis(e.target.value)}
                placeholder="e.g., Court order, GDPR request..."
                className="text-base sm:text-sm"
                maxLength={200}
              />
            </div>

            {/* Effective From */}
            <div className="space-y-2">
              <Label>Effective From *</Label>
              <input
                type="date"
                value={formEffectiveFrom}
                onChange={(e) => setFormEffectiveFrom(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text-primary dark:bg-surface dark:text-text-primary sm:text-sm"
              />
            </div>

            {/* Effective Until */}
            <div className="space-y-2">
              <Label>Effective Until</Label>
              <input
                type="date"
                value={formEffectiveUntil}
                onChange={(e) => setFormEffectiveUntil(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text-primary dark:bg-surface dark:text-text-primary sm:text-sm"
              />
              <p className="text-xs text-text-tertiary">
                Leave empty for indefinite restriction.
              </p>
            </div>

            {/* Review Date */}
            <div className="space-y-2">
              <Label>Review Date</Label>
              <input
                type="date"
                value={formReviewDate}
                onChange={(e) => setFormReviewDate(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text-primary dark:bg-surface dark:text-text-primary sm:text-sm"
              />
              <p className="text-xs text-text-tertiary">
                A review task will be created automatically when the date approaches.
              </p>
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!isFormValid || creating}
            >
              {creating ? 'Creating...' : 'Create Restriction'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ─── Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Restriction Details</SheetTitle>
            <SheetDescription>
              View guardian restriction information and history.
            </SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="mt-8 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : !detailData ? (
            <div className="mt-8 text-center text-text-tertiary">
              Restriction not found.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {/* Status + Type */}
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={detailData.status} />
                <TypeBadge type={detailData.restriction_type} />
              </div>

              {/* Key Details */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <DetailField
                  label="Student"
                  value={
                    detailData.student
                      ? `${detailData.student.first_name} ${detailData.student.last_name}`
                      : '\u2014'
                  }
                />
                <DetailField
                  label="Guardian"
                  value={getParentDisplayName(detailData.parent)}
                />
                <DetailField
                  label="Reason"
                  value={detailData.reason}
                />
                {detailData.legal_basis && (
                  <DetailField
                    label="Legal Basis"
                    value={detailData.legal_basis}
                  />
                )}
                <DetailField
                  label="Effective From"
                  value={formatDate(detailData.effective_from)}
                />
                <DetailField
                  label="Effective Until"
                  value={
                    detailData.effective_until
                      ? formatDate(detailData.effective_until)
                      : 'Indefinite'
                  }
                />
                {detailData.review_date && (
                  <DetailField
                    label="Review Date"
                    value={formatDate(detailData.review_date)}
                  />
                )}
                {detailData.set_by && (
                  <DetailField
                    label="Set By"
                    value={`${detailData.set_by.first_name} ${detailData.set_by.last_name}`}
                  />
                )}
                {detailData.approved_by && (
                  <DetailField
                    label="Approved By"
                    value={`${detailData.approved_by.first_name} ${detailData.approved_by.last_name}`}
                  />
                )}
                <DetailField
                  label="Created"
                  value={formatDate(detailData.created_at)}
                />
              </div>

              {/* Revoke info if revoked */}
              {detailData.status === 'revoked' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Revoked
                  </p>
                  {detailData.revoked_by && (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      By: {detailData.revoked_by.first_name} {detailData.revoked_by.last_name}
                    </p>
                  )}
                  {detailData.revoked_at && (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Date: {formatDate(detailData.revoked_at)}
                    </p>
                  )}
                  {detailData.revoke_reason && (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      Reason: {detailData.revoke_reason}
                    </p>
                  )}
                </div>
              )}

              {/* History */}
              {detailData.history && detailData.history.length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-medium text-text-primary">
                    History
                  </h4>
                  <div className="space-y-2">
                    {detailData.history.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {entry.action}
                          </Badge>
                          <span className="text-xs text-text-tertiary">
                            {formatDate(entry.created_at)}
                          </span>
                        </div>
                        {entry.reason && (
                          <p className="mt-1 text-sm text-text-secondary">
                            {entry.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Revoke button if active */}
              {(detailData.status === 'active_restriction' ||
                detailData.status === 'active') && (
                <Button
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700"
                  onClick={() => openRevoke(detailData.id)}
                >
                  <Ban className="me-1.5 h-4 w-4" />
                  Revoke Restriction
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Revoke Dialog (as Sheet) ────────────────────────────────── */}
      <Sheet open={revokeOpen} onOpenChange={setRevokeOpen}>
        <SheetContent side="end" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Revoke Restriction</SheetTitle>
            <SheetDescription>
              Provide a reason for revoking this guardian restriction.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Reason for Revocation *</Label>
              <Textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Explain why this restriction is being revoked..."
                rows={4}
                className="text-base sm:text-sm"
              />
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setRevokeOpen(false)}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleRevoke}
              disabled={!revokeReason.trim() || revoking}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {revoking ? 'Revoking...' : 'Revoke Restriction'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Detail Field ────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-sm text-text-primary">{value}</p>
    </div>
  );
}
