'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { AudienceDefinition } from '@school/shared/inbox';
import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient, unwrap } from '@/lib/api-client';

import { AudienceForm } from '../_components/audience-form';
import type { ProviderInfo, SavedAudienceRow } from '../_components/types';

interface ProvidersResponse {
  providers: ProviderInfo[];
}

export default function NewSavedAudiencePage() {
  const t = useTranslations('inbox.audiences');
  const tErrors = useTranslations('inbox.audiences.errors');
  const router = useRouter();

  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<ProvidersResponse | { data: ProvidersResponse }>(
      '/api/v1/inbox/audiences/providers',
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        const payload = unwrap<ProvidersResponse>(res);
        setProviders(payload.providers ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[NewSavedAudiencePage.providers]', err);
        setProviders([]);
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (payload: {
    name: string;
    description: string | null;
    kind: 'static' | 'dynamic';
    definition: AudienceDefinition | { user_ids: string[] };
  }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const res = await apiClient<SavedAudienceRow | { data: SavedAudienceRow }>(
        '/api/v1/inbox/audiences',
        {
          method: 'POST',
          body: JSON.stringify(payload),
          silent: true,
        },
      );
      const created = unwrap<SavedAudienceRow>(res);
      toast.success(t('toast.created'));
      router.push(`/inbox/audiences/${created.id}`);
      return { ok: true };
    } catch (err) {
      console.error('[NewSavedAudiencePage.submit]', err);
      const code = (err as { error?: { code?: string } })?.error?.code;
      if (code === 'SAVED_AUDIENCE_NAME_TAKEN') {
        return { ok: false, error: tErrors('nameTaken') };
      }
      if (code === 'SAVED_AUDIENCE_CYCLE_DETECTED') {
        return { ok: false, error: tErrors('cycleDetected') };
      }
      const message =
        (err as { error?: { message?: string } })?.error?.message ??
        (err as { message?: string })?.message ??
        tErrors('generic');
      return { ok: false, error: message };
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newPageTitle')}
        description={t('newPageDescription')}
        actions={
          <Button variant="ghost" onClick={() => router.push('/inbox/audiences')}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {t('actions.back')}
          </Button>
        }
      />

      <AudienceForm
        submitLabel={t('actions.create')}
        onSubmit={handleSubmit}
        providers={providers}
        providersLoading={providersLoading}
      />
    </div>
  );
}
