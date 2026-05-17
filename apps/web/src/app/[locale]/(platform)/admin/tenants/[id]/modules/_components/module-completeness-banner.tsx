import { AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

import type { ModuleKey } from '@school/shared/modules';
import { Button } from '@school/ui';

interface ModuleCompletenessBannerProps {
  completeness: { complete: boolean; missing: ModuleKey[] };
}

export function ModuleCompletenessBanner({ completeness }: ModuleCompletenessBannerProps) {
  if (completeness.complete) {
    return null;
  }

  return (
    <section className="rounded-lg border border-warning-bg bg-warning-bg p-4 text-warning-text">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold">Tenant module rows are incomplete</h2>
            <p className="mt-1 text-sm">
              Missing rows: <span className="font-mono">{completeness.missing.join(', ')}</span>.
              Run the module-gating backfill before relying on toggle state for this tenant.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link
            href="https://github.com/ACANOTES-dev/EduPod/blob/main/docs/runbooks/module-gating-operations.md"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="me-2 h-4 w-4" />
            Runbook
          </Link>
        </Button>
      </div>
    </section>
  );
}
