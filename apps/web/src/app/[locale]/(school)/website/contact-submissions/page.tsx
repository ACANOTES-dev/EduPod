'use client';

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MessageSquare } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button, EmptyState, TableWrapper, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: 'new_submission' | 'reviewed' | 'closed' | 'spam';
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SubmissionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'danger' }> = {
    new: { label: 'New', variant: 'default' },
    new_submission: { label: 'New', variant: 'default' },
    reviewed: { label: 'Reviewed', variant: 'secondary' },
    closed: { label: 'Closed', variant: 'secondary' },
    spam: { label: 'Spam', variant: 'danger' },
  };
  const { label, variant } = config[status] ?? { label: status, variant: 'secondary' };
  return (
    <Badge variant={variant} className="text-xs">
      {label}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContactSubmissionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [submissions, setSubmissions] = React.useState<ContactSubmission[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<string>('new');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const pageSize = 20;

  const fetchSubmissions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiClient<{ data: ContactSubmission[]; meta: { total: number } }>(
        `/api/v1/contact-submissions?${params.toString()}`,
      );
      setSubmissions(res.data);
      setTotal(res.meta.total);
    } catch {
      setSubmissions([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  React.useEffect(() => {
    void fetchSubmissions();
  }, [fetchSubmissions]);

  React.useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [statusFilter]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(`${id}:${newStatus}`);
    try {
      await apiClient(`/api/v1/contact-submissions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success('Status updated');
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: newStatus as ContactSubmission['status'] } : s,
        ),
      );
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const statusTabs = [
    { key: 'new_submission', label: 'New' },
    { key: 'reviewed', label: 'Reviewed' },
    { key: 'closed', label: 'Closed' },
    { key: 'spam', label: 'Spam' },
    { key: 'all', label: 'All' },
  ];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const toolbar = (
    <div className="flex gap-1 border-b border-border">
      {statusTabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setStatusFilter(tab.key)}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            statusFilter === tab.key
              ? 'border-b-2 border-primary-700 text-primary-700'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const pagination = (
    <div className="flex items-center justify-between text-sm text-text-secondary">
      <span>{total === 0 ? 'No results' : `Showing ${startItem}–${endItem} of ${total}`}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <span className="px-2 text-sm text-text-primary">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact Submissions"
        description="Messages submitted through the public contact form"
        actions={
          <Button variant="outline" onClick={() => router.push(`/${locale}/website`)}>
            Back to Pages
          </Button>
        }
      />

      {!isLoading && submissions.length === 0 && statusFilter === 'new' ? (
        <EmptyState
          icon={MessageSquare}
          title="No new submissions"
          description="Contact form submissions will appear here."
        />
      ) : (
        <TableWrapper toolbar={toolbar} pagination={pagination}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Name
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Email
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Phone
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Status
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Submitted
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b border-border last:border-b-0">
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-secondary" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-text-tertiary">
                    No results found
                  </td>
                </tr>
              ) : (
                submissions.map((row) => (
                  <React.Fragment key={row.id}>
                    {/* Main row */}
                    <tr
                      className="cursor-pointer border-b border-border transition-colors hover:bg-surface-secondary"
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    >
                      <td className="w-10 px-4 py-3 text-text-tertiary">
                        {expandedId === row.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        <span dir="ltr">{row.email}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {row.phone ? <span dir="ltr">{row.phone}</span> : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <SubmissionStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>

                    {/* Expanded message row */}
                    {expandedId === row.id && (
                      <tr className="border-b border-border bg-surface-secondary">
                        <td colSpan={6} className="px-4 pb-4 pt-2">
                          <div className="rounded-lg border border-border bg-surface p-4">
                            <p className="mb-4 whitespace-pre-wrap text-sm text-text-primary">
                              {row.message}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {row.status !== 'reviewed' && row.status !== 'spam' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleStatusChange(row.id, 'reviewed');
                                  }}
                                  disabled={updatingId !== null}
                                >
                                  Mark Reviewed
                                </Button>
                              )}
                              {row.status !== 'closed' && row.status !== 'spam' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleStatusChange(row.id, 'closed');
                                  }}
                                  disabled={updatingId !== null}
                                >
                                  Close
                                </Button>
                              )}
                              {row.status !== 'spam' && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleStatusChange(row.id, 'spam');
                                  }}
                                  disabled={updatingId !== null}
                                >
                                  Mark Spam
                                </Button>
                              )}
                              {row.status === 'spam' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleStatusChange(row.id, 'new');
                                  }}
                                  disabled={updatingId !== null}
                                >
                                  Not Spam
                                </Button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </TableWrapper>
      )}
    </div>
  );
}
