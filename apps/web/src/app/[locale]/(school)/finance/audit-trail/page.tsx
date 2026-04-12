'use client';

import { Download, ExternalLink, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useLocale() {
  const pathname = usePathname();
  return (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLogActor {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface AuditLogEntry {
  id: string;
  created_at: string;
  actor: AuditLogActor | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata_json: Record<string, unknown> | null;
}

type EntityTypeFilter =
  | 'all'
  | 'invoice'
  | 'payment'
  | 'refund'
  | 'fee_structure'
  | 'fee_type'
  | 'discount'
  | 'fee_assignment'
  | 'credit_note'
  | 'scholarship'
  | 'receipt';

// ─── Entity link map ──────────────────────────────────────────────────────────

const ENTITY_LINK_MAP: Record<string, string> = {
  invoice: '/finance/invoices',
  payment: '/finance/payments',
  refund: '/finance/refunds',
  fee_structure: '/finance/fee-structures',
  credit_note: '/finance/credit-notes',
  scholarship: '/finance/scholarships',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinanceAuditTrailPage() {
  const t = useTranslations('finance');
  const locale = useLocale();

  const [entries, setEntries] = React.useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 25;

  const [search, setSearch] = React.useState('');
  const [entityTypeFilter, setEntityTypeFilter] = React.useState<EntityTypeFilter>('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const fetchEntries = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (entityTypeFilter !== 'all') params.set('entity_type', entityTypeFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await apiClient<{ data: AuditLogEntry[]; meta: { total: number } }>(
        `/api/v1/finance/audit-trail?${params.toString()}`,
      );
      setEntries(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FinanceAuditTrailPage]', err);
      setEntries([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, entityTypeFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  React.useEffect(() => {
    setPage(1);
  }, [search, entityTypeFilter, dateFrom, dateTo]);

  function handleExportCsv() {
    const params = new URLSearchParams({ domain: 'finance' });
    if (search) params.set('search', search);
    if (entityTypeFilter !== 'all') params.set('entity_type', entityTypeFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    window.open(`${baseUrl}/api/v1/audit-logs/export?${params.toString()}`, '_blank');
  }

  function formatTimestamp(ts: string) {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getEntityReference(entry: AuditLogEntry): string {
    const meta = entry.metadata_json;
    if (meta) {
      if (typeof meta.invoice_number === 'string') return meta.invoice_number;
      if (typeof meta.receipt_number === 'string') return meta.receipt_number;
      if (typeof meta.payment_reference === 'string') return meta.payment_reference;
      if (typeof meta.credit_note_number === 'string') return meta.credit_note_number;
      if (typeof meta.name === 'string') return meta.name;
      if (typeof meta.reference === 'string') return meta.reference;
    }
    return entry.entity_id ? entry.entity_id.slice(0, 8) + '\u2026' : '\u2014';
  }

  function getEntityLink(entry: AuditLogEntry): string | null {
    if (!entry.entity_id) return null;
    const basePath = ENTITY_LINK_MAP[entry.entity_type];
    if (!basePath) return null;
    return `/${locale}${basePath}/${entry.entity_id}`;
  }

  // Backend's audit interceptor currently writes the raw "POST /api/v1/..."
  // string into action. Until the interceptor emits semantic actions
  // (tracked as FIN-008 backend follow-up), normalize client-side so the
  // action pill + description render correctly.
  function normalizeAction(action: string): 'create' | 'update' | 'delete' | 'other' {
    if (/^(create|update|delete)$/i.test(action)) {
      return action.toLowerCase() as 'create' | 'update' | 'delete';
    }
    const methodMatch = /^\s*(GET|POST|PATCH|PUT|DELETE)\b/i.exec(action);
    const method = methodMatch?.[1]?.toUpperCase();
    if (method === 'POST') return 'create';
    if (method === 'PATCH' || method === 'PUT') return 'update';
    if (method === 'DELETE') return 'delete';
    return 'other';
  }

  function getDescription(entry: AuditLogEntry): string {
    const entityLabel = entry.entity_type.replace(/_/g, ' ');
    const ref = getEntityReference(entry);
    const refSuffix = ref !== '\u2014' ? ` (${ref})` : '';

    switch (normalizeAction(entry.action)) {
      case 'create':
        return t('auditDescCreated', { entity: entityLabel, ref: refSuffix });
      case 'update':
        return t('auditDescUpdated', { entity: entityLabel, ref: refSuffix });
      case 'delete':
        return t('auditDescDeleted', { entity: entityLabel, ref: refSuffix });
      default:
        return t('auditDescOther', {
          action: entry.action,
          entity: entityLabel,
          ref: refSuffix,
        });
    }
  }

  const actionBadgeClass: Record<string, string> = {
    create: 'bg-success-100 text-success-700',
    update: 'bg-info-100 text-info-700',
    delete: 'bg-danger-100 text-danger-700',
    other: 'bg-surface-secondary text-text-secondary',
  };

  function getActionLabel(action: string): string {
    const normalized = normalizeAction(action);
    if (normalized === 'other') return action;
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  const columns = [
    {
      key: 'created_at',
      header: t('auditTrail.timestamp'),
      render: (row: AuditLogEntry) => (
        <span className="font-mono text-xs text-text-secondary" dir="ltr">
          {formatTimestamp(row.created_at)}
        </span>
      ),
    },
    {
      key: 'actor',
      header: t('auditTrail.user'),
      render: (row: AuditLogEntry) => (
        <span className="text-sm text-text-primary">
          {row.actor ? `${row.actor.first_name} ${row.actor.last_name}` : '\u2014'}
        </span>
      ),
    },
    {
      key: 'action',
      header: t('auditTrail.action'),
      render: (row: AuditLogEntry) => {
        const normalized = normalizeAction(row.action);
        return (
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
              actionBadgeClass[normalized] ?? actionBadgeClass.other
            }`}
          >
            {getActionLabel(row.action)}
          </span>
        );
      },
    },
    {
      key: 'entity_type',
      header: t('auditTrail.entityType'),
      render: (row: AuditLogEntry) => (
        <span className="text-sm text-text-secondary capitalize">
          {row.entity_type.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'reference',
      header: t('auditTrail.reference'),
      render: (row: AuditLogEntry) => {
        const ref = getEntityReference(row);
        const link = getEntityLink(row);
        if (link) {
          return (
            <a
              href={link}
              className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
            >
              {ref}
              <ExternalLink className="h-3 w-3" />
            </a>
          );
        }
        return <span className="font-mono text-xs text-text-secondary">{ref}</span>;
      },
    },
    {
      key: 'description',
      header: t('auditTrail.descriptionCol'),
      render: (row: AuditLogEntry) => (
        <span className="text-sm text-text-secondary">{getDescription(row)}</span>
      ),
    },
  ];

  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder={t('auditTrail.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>

        <Select
          value={entityTypeFilter}
          onValueChange={(v) => setEntityTypeFilter(v as EntityTypeFilter)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('auditTrail.entityType')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auditTrail.allTypes')}</SelectItem>
            <SelectItem value="invoice">{t('invoices')}</SelectItem>
            <SelectItem value="payment">{t('payments')}</SelectItem>
            <SelectItem value="refund">{t('refunds')}</SelectItem>
            <SelectItem value="receipt">{t('auditTrail.receipt')}</SelectItem>
            <SelectItem value="fee_structure">{t('feeStructures.title')}</SelectItem>
            <SelectItem value="fee_type">{t('auditTrail.feeType')}</SelectItem>
            <SelectItem value="discount">{t('discounts.title')}</SelectItem>
            <SelectItem value="fee_assignment">{t('feeAssignments.title')}</SelectItem>
            <SelectItem value="credit_note">{t('creditNotes.title')}</SelectItem>
            <SelectItem value="scholarship">{t('scholarships.title')}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full sm:w-[150px]"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full sm:w-[150px]"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auditTrail.title')}
        description={t('auditTrail.description')}
        actions={
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="me-2 h-4 w-4" />
            {t('reports.exportCsv')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={entries}
        toolbar={toolbar}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />
    </div>
  );
}
