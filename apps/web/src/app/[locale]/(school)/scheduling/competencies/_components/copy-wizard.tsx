'use client';

import * as React from 'react';

import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { Subject } from './types';

interface YearGroup {
  id: string;
  name: string;
}

export function CopyWizard({
  open,
  onOpenChange,
  sourceYearGroupId,
  availableYearGroups,
  academicYearId,
  subjects,
  sourceCurriculumSubjectIds,
  onCopied,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceYearGroupId: string;
  availableYearGroups: YearGroup[];
  academicYearId: string;
  subjects: Subject[];
  sourceCurriculumSubjectIds: Set<string>;
  onCopied: () => void;
  t: {
    title: string;
    /** Already-formatted description with source year group name inlined. */
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    targetYear: string;
    mergeNote: string;
    next: string;
    back: string;
    cancel: string;
    loading: string;
    copyCount: (n: number) => string;
    copiedToast: (copied: number, skipped: number) => string;
    errorGeneric: string;
  };
}) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [targets, setTargets] = React.useState<Set<string>>(new Set());
  const [targetSubjects, setTargetSubjects] = React.useState<Map<string, Set<string>>>(new Map());
  const [selections, setSelections] = React.useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setTargets(new Set());
    setTargetSubjects(new Map());
    setSelections(new Map());
  }, [open]);

  const toggleTarget = (ygId: string) => {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(ygId)) next.delete(ygId);
      else next.add(ygId);
      return next;
    });
  };

  const goToStep2 = async () => {
    if (targets.size === 0) return;
    setLoading(true);
    try {
      const targetIds = [...targets];
      const results = await Promise.all(
        targetIds.map((ygId) =>
          apiClient<{ data: Array<{ subject: { id: string } }> }>(
            `/api/v1/scheduling/curriculum-requirements/matrix-subjects?academic_year_id=${academicYearId}&year_group_id=${ygId}`,
            { silent: true },
          ).then((res) => ({
            ygId,
            subjectIds: new Set(res.data.map((r) => r.subject.id)),
          })),
        ),
      );
      const targetSubMap = new Map<string, Set<string>>();
      const initialSelections = new Map<string, boolean>();
      for (const { ygId, subjectIds } of results) {
        const commonIds = new Set(
          [...subjectIds].filter((sid) => sourceCurriculumSubjectIds.has(sid)),
        );
        targetSubMap.set(ygId, commonIds);
        for (const sid of commonIds) initialSelections.set(`${ygId}:${sid}`, true);
      }
      setTargetSubjects(targetSubMap);
      setSelections(initialSelections);
      setStep(2);
    } catch (err) {
      console.error('[CopyWizard.goToStep2]', err);
      toast.error(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  const commonSubjects = React.useMemo(() => {
    const allSubjectIds = new Set<string>();
    for (const subs of targetSubjects.values()) {
      for (const sid of subs) allSubjectIds.add(sid);
    }
    return subjects.filter((s) => allSubjectIds.has(s.id));
  }, [targetSubjects, subjects]);

  const toggleCell = (ygId: string, subjectId: string) => {
    const key = `${ygId}:${subjectId}`;
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(key, !prev.get(key));
      return next;
    });
  };

  const selectedCount = React.useMemo(() => {
    let count = 0;
    for (const v of selections.values()) if (v) count++;
    return count;
  }, [selections]);

  const handleCopy = async () => {
    const targetsMap = new Map<string, string[]>();
    for (const [key, checked] of selections) {
      if (!checked) continue;
      const idx = key.indexOf(':');
      const ygId = key.slice(0, idx);
      const subjectId = key.slice(idx + 1);
      if (!targetsMap.has(ygId)) targetsMap.set(ygId, []);
      targetsMap.get(ygId)!.push(subjectId);
    }
    const targetsArr = [...targetsMap.entries()].map(([year_group_id, subject_ids]) => ({
      year_group_id,
      subject_ids,
    }));
    if (targetsArr.length === 0) return;
    setLoading(true);
    try {
      const res = await apiClient<{ data: { copied: number; skipped: number } }>(
        '/api/v1/scheduling/teacher-competencies/copy-to-years',
        {
          method: 'POST',
          body: JSON.stringify({
            academic_year_id: academicYearId,
            source_year_group_id: sourceYearGroupId,
            targets: targetsArr,
          }),
        },
      );
      toast.success(t.copiedToast(res.data.copied, res.data.skipped));
      onOpenChange(false);
      onCopied();
    } catch (err) {
      console.error('[CopyWizard.handleCopy]', err);
      toast.error(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>{t.title}</DialogTitle>
              <DialogDescription>{t.step1Desc}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2 max-h-[40vh] overflow-y-auto">
              {availableYearGroups.map((yg) => {
                const isSelected = targets.has(yg.id);
                return (
                  <label
                    key={yg.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-surface-secondary'
                    }`}
                  >
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleTarget(yg.id)} />
                    <span className="text-sm font-medium">{yg.name}</span>
                  </label>
                );
              })}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-secondary transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={targets.size === 0 || loading}
                onClick={() => void goToStep2()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? t.loading : t.next}
              </button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>{t.step2Title}</DialogTitle>
              <DialogDescription>{t.step2Desc}</DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="px-3 py-2 text-start text-xs font-medium text-text-tertiary uppercase sticky start-0 bg-surface-secondary z-10">
                      {t.targetYear}
                    </th>
                    {commonSubjects.map((s) => (
                      <th
                        key={s.id}
                        className="px-3 py-2 text-center text-xs font-medium text-text-tertiary uppercase"
                      >
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...targets].map((ygId) => {
                    const yg = availableYearGroups.find((y) => y.id === ygId);
                    const targetSubs = targetSubjects.get(ygId) ?? new Set<string>();
                    return (
                      <tr key={ygId} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-text-primary sticky start-0 bg-surface z-10 whitespace-nowrap">
                          {yg?.name ?? ''}
                        </td>
                        {commonSubjects.map((s) => {
                          const isCommon = targetSubs.has(s.id);
                          if (!isCommon) {
                            return (
                              <td
                                key={s.id}
                                className="px-3 py-2 text-center text-text-tertiary bg-surface-secondary/50"
                              >
                                —
                              </td>
                            );
                          }
                          const key = `${ygId}:${s.id}`;
                          return (
                            <td key={s.id} className="px-3 py-2 text-center">
                              <Checkbox
                                checked={!!selections.get(key)}
                                onCheckedChange={() => toggleCell(ygId, s.id)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
              {t.mergeNote}
            </div>
            <DialogFooter className="flex-row justify-between sm:justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-secondary transition-colors"
              >
                {t.back}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-secondary transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  disabled={selectedCount === 0 || loading}
                  onClick={() => void handleCopy()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? t.loading : t.copyCount(selectedCount)}
                </button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
