'use client';

import { Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, StatusBadge, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Threshold {
  min_score: number;
  label: string;
  label_ar: string;
}

interface ThresholdConfig {
  id: string;
  name: string;
  thresholds_json: Threshold[];
  is_default: boolean;
  created_at: string;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradeThresholdsPage() {
  const t = useTranslations('settings');
  const tr = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [configs, setConfigs] = React.useState<ThresholdConfig[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchConfigs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<ListResponse<ThresholdConfig>>('/api/v1/grade-threshold-configs');
      setConfigs(res.data);
    } catch (err) {
      console.error('[SettingsGradeThresholdsPage]', err);
      setConfigs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const handleCreate = () => {
    const blank: ThresholdConfig = {
      id: `__new_${Date.now()}`,
      name: '',
      thresholds_json: [
        { min_score: 90, label: 'Distinction', label_ar: 'امتياز' },
        { min_score: 70, label: 'Merit', label_ar: 'جيد جداً' },
        { min_score: 50, label: 'Pass', label_ar: 'مقبول' },
        { min_score: 0, label: 'Below Expectations', label_ar: 'دون المستوى' },
      ],
      is_default: false,
      created_at: new Date().toISOString(),
    };
    setConfigs((prev) => [...prev, blank]);
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('__new_')) {
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    try {
      await apiClient(`/api/v1/grade-threshold-configs/${id}`, { method: 'DELETE' });
      toast.success(tc('deleted'));
      void fetchConfigs();
    } catch (err) {
      console.error('[SettingsGradeThresholdsPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await apiClient(`/api/v1/grade-threshold-configs/${id}/set-default`, { method: 'POST' });
      toast.success(tr('thresholdSetAsDefault'));
      void fetchConfigs();
    } catch (err) {
      console.error('[SettingsGradeThresholdsPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleSave = async (config: ThresholdConfig) => {
    const isNew = config.id.startsWith('__new_');
    try {
      if (isNew) {
        await apiClient('/api/v1/grade-threshold-configs', {
          method: 'POST',
          body: JSON.stringify({
            name: config.name,
            thresholds_json: config.thresholds_json,
          }),
        });
      } else {
        await apiClient(`/api/v1/grade-threshold-configs/${config.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: config.name,
            thresholds_json: config.thresholds_json,
          }),
        });
      }
      toast.success(tc('saved'));
      void fetchConfigs();
    } catch (err) {
      console.error('[SettingsGradeThresholdsPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleUpdate = (id: string, updated: ThresholdConfig) => {
    setConfigs((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('gradeThresholds')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('gradeThresholdsDesc')}</p>
        </div>
        <Button onClick={handleCreate} className="w-full sm:w-auto">
          <Plus className="me-2 h-4 w-4" />
          {tr('newThresholdConfig')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
        </div>
      ) : configs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-text-tertiary">{tc('noResults')}</p>
          <Button variant="outline" onClick={handleCreate} className="mt-4">
            <Plus className="me-2 h-4 w-4" />
            {tr('newThresholdConfig')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => (
            <ThresholdConfigCard
              key={config.id}
              config={config}
              onUpdate={(updated) => handleUpdate(config.id, updated)}
              onSave={() => void handleSave(config)}
              onDelete={() => void handleDelete(config.id)}
              onSetDefault={() => void handleSetDefault(config.id)}
              tr={tr}
              tc={tc}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Threshold Config Card ────────────────────────────────────────────────────

interface ThresholdConfigCardProps {
  config: ThresholdConfig;
  onUpdate: (updated: ThresholdConfig) => void;
  onSave: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  tr: ReturnType<typeof useTranslations<'reportCards'>>;
  tc: ReturnType<typeof useTranslations<'common'>>;
}

function ThresholdConfigCard({
  config,
  onUpdate,
  onSave,
  onDelete,
  onSetDefault,
  tr,
  tc,
}: ThresholdConfigCardProps) {
  const tCommon = useTranslations('common');
  const [saving, setSaving] = React.useState(false);

  const handleNameChange = (v: string) => {
    onUpdate({ ...config, name: v });
  };

  const handleThresholdChange = (idx: number, field: keyof Threshold, value: string) => {
    const updated = config.thresholds_json.map((t, i) => {
      if (i !== idx) return t;
      if (field === 'min_score') {
        const n = parseFloat(value);
        return { ...t, min_score: isNaN(n) ? 0 : n };
      }
      return { ...t, [field]: value };
    });
    onUpdate({ ...config, thresholds_json: updated });
  };

  const handleAddThreshold = () => {
    onUpdate({
      ...config,
      thresholds_json: [...config.thresholds_json, { min_score: 0, label: '', label_ar: '' }],
    });
  };

  const handleRemoveThreshold = (idx: number) => {
    onUpdate({
      ...config,
      thresholds_json: config.thresholds_json.filter((_, i) => i !== idx),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.resolve(onSave());
    } finally {
      setSaving(false);
    }
  };

  // Preview string: sorted by min_score desc, show label for each
  const preview = [...config.thresholds_json]
    .sort((a, b) => b.min_score - a.min_score)
    .map((t) => `${t.min_score}% → ${t.label || '—'}`)
    .join(', ');

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Input
            value={config.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={tr('thresholdConfigName')}
            className="max-w-xs font-medium"
          />
          {config.is_default && (
            <StatusBadge status="success">
              <Star className="me-1 h-3 w-3" />
              {tr('default')}
            </StatusBadge>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {!config.is_default && !config.id.startsWith('__new_') && (
            <Button size="sm" variant="ghost" onClick={onSetDefault}>
              <Star className="me-1 h-3.5 w-3.5" />
              {tr('setAsDefault')}
            </Button>
          )}
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : null}
            {tc('save')}
          </Button>
          {!config.is_default && (
            <Button
              size="sm"
              variant="ghost"
              className="text-error-600 hover:text-error-700"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Thresholds editor */}
      <div className="p-5 space-y-3">
        {/* Column headers */}
        <div className="grid grid-cols-[80px_1fr_1fr_32px] gap-2 px-1">
          <Label className="text-xs text-text-tertiary">{tr('minScore')}</Label>
          <Label className="text-xs text-text-tertiary">{tr('labelEn')}</Label>
          <Label className="text-xs text-text-tertiary">{tr('labelAr')}</Label>
          <span />
        </div>

        {[...config.thresholds_json]
          .sort((a, b) => b.min_score - a.min_score)
          .map((threshold) => {
            // Find original index in unsorted array
            const origIdx = config.thresholds_json.findIndex(
              (t) => t.min_score === threshold.min_score && t.label === threshold.label,
            );
            return (
              <div key={origIdx} className="grid grid-cols-[80px_1fr_1fr_32px] gap-2 items-center">
                <Input
                  type="number"
                  value={threshold.min_score}
                  onChange={(e) => handleThresholdChange(origIdx, 'min_score', e.target.value)}
                  min={0}
                  max={100}
                  className="text-center font-mono text-sm"
                  dir="ltr"
                />
                <Input
                  value={threshold.label}
                  onChange={(e) => handleThresholdChange(origIdx, 'label', e.target.value)}
                  placeholder={t('eGMerit')}
                />
                <Input
                  value={threshold.label_ar}
                  onChange={(e) => handleThresholdChange(origIdx, 'label_ar', e.target.value)}
                  placeholder="e.g. جيد"
                  dir="rtl"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveThreshold(origIdx)}
                  className="rounded p-1 text-text-tertiary hover:text-error-600"
                  aria-label={tCommon('remove')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

        <Button size="sm" variant="outline" onClick={handleAddThreshold}>
          <Plus className="me-2 h-3.5 w-3.5" />
          {tr('addThreshold')}
        </Button>

        {/* Preview */}
        {preview && (
          <div className="mt-3 rounded-xl bg-surface-secondary px-4 py-2.5">
            <p className="text-xs text-text-tertiary">
              <span className="font-medium">{tr('preview')}:</span> <span dir="ltr">{preview}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
