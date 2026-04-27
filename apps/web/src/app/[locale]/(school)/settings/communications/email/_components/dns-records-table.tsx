'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, toast } from '@school/ui';

interface DnsRecord {
  record: 'SPF' | 'DKIM' | 'DMARC';
  type: string;
  name: string;
  value: string;
  status: 'pending' | 'verified' | 'failed';
}

export function DnsRecordsTable({ records }: { records: DnsRecord[] }) {
  const t = useTranslations('settings.communications.email.domains.dns');

  async function onCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('copy.success'));
    } catch (err) {
      console.error('[DnsRecordsTable.onCopy]', err);
      toast.error(t('copy.error'));
    }
  }

  if (records.length === 0) {
    return <p className="text-xs text-text-tertiary">{t('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] text-start text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-text-tertiary">
            <th className="pb-2 ps-0 pe-3 text-start font-medium">{t('headers.type')}</th>
            <th className="pb-2 pe-3 text-start font-medium">{t('headers.name')}</th>
            <th className="pb-2 pe-3 text-start font-medium">{t('headers.value')}</th>
            <th className="pb-2 pe-3 text-start font-medium">{t('headers.status')}</th>
            <th className="pb-2 pe-0 text-start font-medium" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.record}-${r.name}`} className="border-b border-border last:border-b-0">
              <td className="py-3 pe-3 font-mono text-xs">{r.record}</td>
              <td className="py-3 pe-3 font-mono text-xs" dir="ltr">
                {r.name}
              </td>
              <td className="py-3 pe-3">
                <code
                  className="block max-w-[280px] truncate font-mono text-xs"
                  dir="ltr"
                  title={r.value}
                >
                  {r.value}
                </code>
              </td>
              <td className="py-3 pe-3">
                <span
                  className={`text-xs font-medium ${
                    r.status === 'verified'
                      ? 'text-success'
                      : r.status === 'failed'
                        ? 'text-destructive'
                        : 'text-warning'
                  }`}
                >
                  {t(`status.${r.status}`)}
                </span>
              </td>
              <td className="py-3 pe-0">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onCopy(r.value)}
                  aria-label={t('copy.aria')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
