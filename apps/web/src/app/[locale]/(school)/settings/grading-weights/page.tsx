'use client';

import { Copy, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface CategoryWeight {
  category_id: string;
  weight: number;
}

interface WeightConfig {
  id: string;
  year_group_id: string;
  academic_period_id: string;
  period_name?: string;
  category_weights: CategoryWeight[];
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function GradingWeightsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  // Filter options
  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);
  const [periods, setPeriods] = React.useState<SelectOption[]>([]);
  const [categories, setCategories] = React.useState<SelectOption[]>([]);
  const [selectedYearGroup, setSelectedYearGroup] = React.useState('');

  // Weight configs for the selected year group
  const [configs, setConfigs] = React.useState<WeightConfig[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Editing state — one set of weights per period
  const [editWeights, setEditWeights] = React.useState<Record<string, CategoryWeight[]>>({});

  // Copy dialog
  const [copyDialogOpen, setCopyDialogOpen] = React.useState(false);
  const [copyTarget, setCopyTarget] = React.useState('');

  // Load filter options on mount
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/gradebook/assessment-categories?pageSize=50')
      .then((res) => setCategories(res.data))
      .catch(() => undefined);
  }, []);

  // Fetch configs when year group changes
  const fetchConfigs = React.useCallback(async (ygId: string) => {
    if (!ygId) return;
    setIsLoading(true);
    try {
      const res = await apiClient<ListResponse<WeightConfig>>(
        `/api/v1/gradebook/year-group-weights/${ygId}`,
      );
      setConfigs(res.data);
      // Build initial edit state
      const weights: Record<string, CategoryWeight[]> = {};
      for (const config of res.data) {
        weights[config.academic_period_id] = config.category_weights;
      }
      setEditWeights(weights);
    } catch {
      setConfigs([]);
      setEditWeights({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedYearGroup) {
      void fetchConfigs(selectedYearGroup);
    }
  }, [selectedYearGroup, fetchConfigs]);

  // Get or initialise weights for a period
  const getWeightsForPeriod = (periodId: string): CategoryWeight[] => {
    if (editWeights[periodId]) return editWeights[periodId];
    return categories.map((c) => ({ category_id: c.id, weight: 0 }));
  };

  // Update a weight value
  const updateWeight = (periodId: string, categoryId: string, value: number) => {
    setEditWeights((prev) => {
      const current = prev[periodId] ?? categories.map((c) => ({ category_id: c.id, weight: 0 }));
      return {
        ...prev,
        [periodId]: current.map((w) =>
          w.category_id === categoryId ? { ...w, weight: value } : w,
        ),
      };
    });
  };

  // Save a single period's weights
  const handleSave = async (periodId: string) => {
    if (!selectedYearGroup) return;
    const weights = getWeightsForPeriod(periodId);
    const sum = weights.reduce((acc, w) => acc + w.weight, 0);
    if (sum !== 100 && sum !== 0) {
      toast.error(t('gradingWeightsSum'));
      return;
    }
    setIsSaving(true);
    try {
      await apiClient('/api/v1/gradebook/year-group-weights', {
        method: 'PUT',
        body: JSON.stringify({
          year_group_id: selectedYearGroup,
          academic_period_id: periodId,
          category_weights: weights,
        }),
      });
      toast.success(tc('saved'));
      void fetchConfigs(selectedYearGroup);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsSaving(false);
    }
  };

  // Copy configs to another year group
  const handleCopy = async () => {
    if (!selectedYearGroup || !copyTarget) return;
    try {
      await apiClient('/api/v1/gradebook/year-group-weights/copy', {
        method: 'POST',
        body: JSON.stringify({
          source_year_group_id: selectedYearGroup,
          target_year_group_id: copyTarget,
        }),
      });
      toast.success(tc('saved'));
      setCopyDialogOpen(false);
      setCopyTarget('');
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('gradingWeights')} description={t('gradingWeightsDescription')} />

      {/* Year group selector + copy button */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedYearGroup} onValueChange={setSelectedYearGroup}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={t('selectYearGroup')} />
          </SelectTrigger>
          <SelectContent>
            {yearGroups.map((yg) => (
              <SelectItem key={yg.id} value={yg.id}>
                {yg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedYearGroup && configs.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(true)}>
            <Copy className="me-2 h-3.5 w-3.5" />
            {t('copyTo')}
          </Button>
        )}
      </div>

      {/* No year group selected */}
      {!selectedYearGroup && (
        <p className="py-12 text-center text-sm text-text-tertiary">{t('selectYearGroupPrompt')}</p>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      )}

      {/* Weight configuration per period */}
      {!isLoading && selectedYearGroup && (
        <div className="space-y-6">
          {periods.map((period) => {
            const weights = getWeightsForPeriod(period.id);
            const sum = weights.reduce((acc, w) => acc + w.weight, 0);
            const isValid = sum === 100 || sum === 0;

            return (
              <div
                key={period.id}
                className="rounded-xl border border-border bg-surface p-5 space-y-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">{period.name}</h3>
                  <span
                    className={`text-xs font-medium ${
                      isValid ? 'text-success-text' : 'text-danger-text'
                    }`}
                  >
                    {t('totalWeight')}: {sum}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {categories.map((cat) => {
                    const w = weights.find((w) => w.category_id === cat.id);
                    return (
                      <div key={cat.id} className="space-y-1">
                        <Label className="text-xs text-text-secondary">{cat.name}</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={String(w?.weight ?? 0)}
                            onChange={(e) =>
                              updateWeight(period.id, cat.id, Number(e.target.value) || 0)
                            }
                            className="w-20"
                          />
                          <span className="text-xs text-text-tertiary">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => handleSave(period.id)}
                    disabled={isSaving || !isValid}
                  >
                    <Save className="me-2 h-3.5 w-3.5" />
                    {isSaving ? tc('loading') : tc('save')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Copy dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('copyWeightsTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{t('copyWeightsDescription')}</p>
            <div>
              <Label>{t('targetYearGroup')}</Label>
              <Select value={copyTarget} onValueChange={setCopyTarget}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectYearGroup')} />
                </SelectTrigger>
                <SelectContent>
                  {yearGroups
                    .filter((yg) => yg.id !== selectedYearGroup)
                    .map((yg) => (
                      <SelectItem key={yg.id} value={yg.id}>
                        {yg.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCopy} disabled={!copyTarget}>
              <Copy className="me-2 h-3.5 w-3.5" />
              {t('copyWeights')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
