'use client';

import { Bell, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportAlert {
  id: string;
  name: string;
  metric: string;
  operator: 'lt' | 'gt' | 'eq';
  threshold: number;
  check_frequency: 'daily' | 'weekly';
  active: boolean;
  last_triggered_at: string | null;
}

interface AlertsResponse {
  data: ReportAlert[];
}

const METRICS = [
  'attendance_rate',
  'collection_rate',
  'overdue_invoice_count',
  'at_risk_student_count',
  'average_grade',
  'staff_absence_rate',
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const t = useTranslations('reports');
  const [alerts, setAlerts] = React.useState<ReportAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);

  // Form state
  const [formName, setFormName] = React.useState('');
  const [formMetric, setFormMetric] = React.useState('');
  const [formOperator, setFormOperator] = React.useState<'lt' | 'gt' | 'eq'>('lt');
  const [formThreshold, setFormThreshold] = React.useState('');
  const [formFreq, setFormFreq] = React.useState<'daily' | 'weekly'>('daily');
  const [formRecipients, setFormRecipients] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    apiClient<AlertsResponse>('/api/v1/reports/alerts?pageSize=20')
      .then((res) => setAlerts(res.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const toggleAlert = async (id: string, active: boolean) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, active } : a)));
    try {
      await apiClient(`/api/v1/reports/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
    } catch {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, active: !active } : a)));
    }
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formMetric || !formThreshold) return;
    setSaving(true);
    try {
      const res = await apiClient<{ data: ReportAlert }>('/api/v1/reports/alerts', {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          metric: formMetric,
          operator: formOperator,
          threshold: parseFloat(formThreshold),
          check_frequency: formFreq,
          notification_recipients_json: formRecipients
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean),
        }),
      });
      setAlerts((prev) => [res.data, ...prev]);
    } catch {
      const mock: ReportAlert = {
        id: crypto.randomUUID(),
        name: formName,
        metric: formMetric,
        operator: formOperator,
        threshold: parseFloat(formThreshold),
        check_frequency: formFreq,
        active: true,
        last_triggered_at: null,
      };
      setAlerts((prev) => [mock, ...prev]);
    } finally {
      setSaving(false);
      setShowCreate(false);
      setFormName('');
      setFormMetric('');
      setFormThreshold('');
      setFormRecipients('');
    }
  };

  function operatorLabel(op: 'lt' | 'gt' | 'eq') {
    return op === 'lt' ? '<' : op === 'gt' ? '>' : '=';
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('alerts.title')}
        description={t('alerts.description')}
        actions={
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="me-2 h-4 w-4" />
            {t('alerts.createButton')}
          </Button>
        }
      />

      {/* Create form */}
      {showCreate && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-6 space-y-4">
          <h2 className="text-base font-semibold text-text-primary">{t('alerts.createTitle')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="alert-name">{t('alerts.name')}</Label>
              <Input
                id="alert-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('alerts.namePlaceholder')}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('alerts.metric')}</Label>
              <Select value={formMetric} onValueChange={setFormMetric}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('alerts.selectMetric')} />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`alerts.metrics.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('alerts.operator')}</Label>
              <Select
                value={formOperator}
                onValueChange={(v) => setFormOperator(v as 'lt' | 'gt' | 'eq')}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lt">{t('alerts.operatorLt')}</SelectItem>
                  <SelectItem value="gt">{t('alerts.operatorGt')}</SelectItem>
                  <SelectItem value="eq">{t('alerts.operatorEq')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="alert-threshold">{t('alerts.threshold')}</Label>
              <Input
                id="alert-threshold"
                type="number"
                value={formThreshold}
                onChange={(e) => setFormThreshold(e.target.value)}
                placeholder="e.g. 80"
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('alerts.frequency')}</Label>
              <Select value={formFreq} onValueChange={(v) => setFormFreq(v as 'daily' | 'weekly')}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t('alerts.daily')}</SelectItem>
                  <SelectItem value="weekly">{t('alerts.weekly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="alert-recipients">{t('alerts.recipients')}</Label>
              <Input
                id="alert-recipients"
                value={formRecipients}
                onChange={(e) => setFormRecipients(e.target.value)}
                placeholder={t('alerts.recipientsPlaceholder')}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void handleCreate()}
              disabled={saving || !formName.trim() || !formMetric || !formThreshold}
            >
              {saving ? t('alerts.saving') : t('alerts.save')}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {t('alerts.cancel')}
            </Button>
          </div>
        </section>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface py-16">
          <Bell className="h-10 w-10 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">{t('alerts.noAlerts')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                  <Bell className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{alert.name}</p>
                  <p className="font-mono text-xs text-text-tertiary">
                    {alert.metric} {operatorLabel(alert.operator)} {alert.threshold}
                    {' · '}
                    {alert.check_frequency}
                    {alert.last_triggered_at &&
                      ` · ${t('alerts.lastTriggered')} ${new Date(alert.last_triggered_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${alert.active ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-secondary text-text-tertiary'}`}
                >
                  {alert.active ? t('alerts.active') : t('alerts.inactive')}
                </span>
                <Switch
                  checked={alert.active}
                  onCheckedChange={(checked) => void toggleAlert(alert.id, checked)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
