'use client';

import { PageHeader } from '@/components/page-header';

import { AlertRulesManager } from '../_components/alert-rules-manager';

export default function PlatformAlertRulesPage() {
  return (
    <div className="min-w-0">
      <PageHeader title="Alert Rules" />
      <div className="mt-6">
        <AlertRulesManager />
      </div>
    </div>
  );
}
