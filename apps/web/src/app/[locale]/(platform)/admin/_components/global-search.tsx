'use client';

import { Bell, Building2, Loader2, Search, UserRound, Workflow } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogTitle,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface PlatformSearchResults {
  alerts: Array<{
    fired_at: string;
    id: string;
    message: string;
    rule_name: string;
    severity: string;
    status: string;
  }>;
  jobs: Array<{
    attempts_made: number;
    failed_reason: string | null;
    id: string;
    name: string;
    queue: string;
    status: string;
    timestamp: number;
  }>;
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
  }>;
  users: Array<{
    email: string;
    first_name: string;
    global_status: string;
    id: string;
    last_name: string;
  }>;
}

const EMPTY_RESULTS: PlatformSearchResults = {
  alerts: [],
  jobs: [],
  tenants: [],
  users: [],
};

interface GlobalSearchProps {
  locale: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function GlobalSearch({ locale, onOpenChange, open }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<PlatformSearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(EMPTY_RESULTS);
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      apiClient<PlatformSearchResults>(`/api/v1/admin/search?q=${encodeURIComponent(trimmed)}`, {
        silent: true,
      })
        .then((nextResults) => {
          if (!cancelled) {
            setResults(nextResults);
          }
        })
        .catch((err: unknown) => {
          console.error('[GlobalSearch.search]', err);
          if (!cancelled) {
            setResults(EMPTY_RESULTS);
            setError('Search failed. Try again.');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  function navigateTo(path: string) {
    onOpenChange(false);
    router.push(path);
  }

  const hasResults =
    results.tenants.length > 0 ||
    results.users.length > 0 ||
    results.alerts.length > 0 ||
    results.jobs.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] overflow-hidden border-border bg-surface p-0">
        <DialogTitle className="sr-only">Search platform</DialogTitle>
        <Command shouldFilter={false} className="bg-surface text-text-primary">
          <div className="relative">
            <CommandInput
              autoFocus
              placeholder="Search tenants, users, alerts, jobs..."
              value={query}
              onValueChange={setQuery}
              className="pe-10 text-text-primary placeholder:text-text-tertiary"
            />
            {loading ? (
              <Loader2 className="absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-tertiary" />
            ) : null}
          </div>
          <CommandList className="max-h-[420px]">
            {query.trim().length < 2 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-text-secondary">
                <Search className="h-5 w-5 text-text-tertiary" />
                Type at least two characters to search the platform.
              </div>
            ) : error ? (
              <div className="px-6 py-8 text-center text-sm text-danger-text">{error}</div>
            ) : !hasResults && !loading ? (
              <CommandEmpty>No results found for &quot;{query.trim()}&quot;.</CommandEmpty>
            ) : null}

            {results.tenants.length > 0 ? (
              <CommandGroup heading="Tenants">
                {results.tenants.map((tenant) => (
                  <CommandItem
                    key={tenant.id}
                    value={`tenant-${tenant.id}`}
                    onSelect={() => navigateTo(`/${locale}/admin/tenants/${tenant.id}`)}
                  >
                    <Building2 className="me-3 h-4 w-4 text-text-tertiary" />
                    <ResultText
                      description={`${tenant.slug} · ${tenant.status}`}
                      label={tenant.name}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {results.users.length > 0 ? (
              <CommandGroup heading="Users">
                {results.users.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={`user-${user.id}`}
                    onSelect={() => navigateTo(`/${locale}/admin/users/${user.id}`)}
                  >
                    <UserRound className="me-3 h-4 w-4 text-text-tertiary" />
                    <ResultText
                      description={`${user.email} · ${user.global_status}`}
                      label={`${user.first_name} ${user.last_name}`}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {results.alerts.length > 0 ? (
              <CommandGroup heading="Alerts">
                {results.alerts.map((alert) => (
                  <CommandItem
                    key={alert.id}
                    value={`alert-${alert.id}`}
                    onSelect={() => navigateTo(`/${locale}/admin/alerts`)}
                  >
                    <Bell className="me-3 h-4 w-4 text-text-tertiary" />
                    <ResultText
                      description={`${alert.rule_name} · ${alert.severity} · ${alert.status}`}
                      label={alert.message}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {results.jobs.length > 0 ? (
              <CommandGroup heading="Jobs">
                {results.jobs.map((job) => (
                  <CommandItem
                    key={`${job.queue}-${job.id}`}
                    value={`job-${job.queue}-${job.id}`}
                    onSelect={() =>
                      navigateTo(`/${locale}/admin/queues/${job.queue}?job=${job.id}`)
                    }
                  >
                    <Workflow className="me-3 h-4 w-4 text-text-tertiary" />
                    <ResultText
                      description={`${job.queue} · ${job.status} · ${job.attempts_made} attempts`}
                      label={job.name}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function ResultText({ description, label }: { description: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-text-primary">{label}</p>
      <p className="mt-0.5 truncate text-xs text-text-secondary">{description}</p>
    </div>
  );
}
