'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CopyWizard } from './_components/copy-wizard';
import { PinMatrix } from './_components/pin-matrix';
import { PoolMatrix } from './_components/pool-matrix';
import type { Competency, StaffProfile, Subject } from './_components/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}
interface YearGroup {
  id: string;
  name: string;
}
interface ClassRow {
  id: string;
  name: string;
  year_group_id: string | null;
}

const POOL_TAB = '__pool__';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetenciesPage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [teachers, setTeachers] = React.useState<StaffProfile[]>([]);
  const [classes, setClasses] = React.useState<ClassRow[]>([]);
  const [competencies, setCompetencies] = React.useState<Competency[]>([]);
  const [curriculumSubjectIds, setCurriculumSubjectIds] = React.useState<Set<string>>(new Set());

  const [selectedYear, setSelectedYear] = React.useState('');
  const [selectedYg, setSelectedYg] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<string>(POOL_TAB);
  const [isLoadingBoard, setIsLoadingBoard] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const teacherRoleStaff = React.useMemo(
    () => teachers.filter((t) => t.roles.some((r) => r.toLowerCase() === 'teacher')),
    [teachers],
  );

  const classesForYg = React.useMemo(
    () => classes.filter((c) => c.year_group_id === selectedYg),
    [classes, selectedYg],
  );

  const matrixSubjects = React.useMemo(
    () =>
      curriculumSubjectIds.size > 0 ? subjects.filter((s) => curriculumSubjectIds.has(s.id)) : [],
    [subjects, curriculumSubjectIds],
  );

  const availableYearGroups = React.useMemo(
    () => yearGroups.filter((yg) => yg.id !== selectedYg),
    [yearGroups, selectedYg],
  );

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
      apiClient<{ data: Subject[] }>('/api/v1/subjects?pageSize=100'),
      apiClient<{
        data: Array<{
          id: string;
          user?: { first_name: string; last_name: string };
          roles?: string[];
        }>;
        meta: { total: number };
      }>('/api/v1/staff-profiles?pageSize=100'),
    ])
      .then(async ([yearsRes, ygRes, subRes, staffRes]) => {
        setAcademicYears(yearsRes.data);
        setYearGroups(ygRes.data);
        setSubjects(subRes.data);

        let allStaff = staffRes.data ?? [];
        const total = staffRes.meta?.total ?? allStaff.length;
        if (total > 100) {
          const remaining = await apiClient<{ data: typeof allStaff }>(
            '/api/v1/staff-profiles?pageSize=100&page=2',
          );
          allStaff = [...allStaff, ...(remaining.data ?? [])];
        }

        setTeachers(
          allStaff.map((s) => ({
            id: s.id,
            name: s.user ? `${s.user.first_name} ${s.user.last_name}` : s.id,
            roles: s.roles ?? [],
          })),
        );
        if (yearsRes.data[0]) setSelectedYear(yearsRes.data[0].id);
        if (ygRes.data[0]) setSelectedYg(ygRes.data[0].id);
      })
      .catch((err) => {
        console.error('[CompetenciesPage.bootstrap]', err);
        toast.error(tc('errorGeneric'));
      });
  }, [tc]);

  React.useEffect(() => {
    if (!selectedYear) return;
    apiClient<{
      data: Array<{ id: string; name: string; year_group_id: string | null; status: string }>;
    }>(`/api/v1/classes?academic_year_id=${selectedYear}&pageSize=200`, { silent: true })
      .then((res) =>
        setClasses(
          res.data
            .filter((c) => c.status === 'active')
            .map((c) => ({ id: c.id, name: c.name, year_group_id: c.year_group_id })),
        ),
      )
      .catch((err) => {
        console.error('[CompetenciesPage.classes]', err);
        setClasses([]);
      });
  }, [selectedYear]);

  React.useEffect(() => {
    if (!selectedYear || !selectedYg) {
      setCurriculumSubjectIds(new Set());
      return;
    }
    apiClient<{ data: Array<{ subject: { id: string } }> }>(
      `/api/v1/scheduling/curriculum-requirements/matrix-subjects?academic_year_id=${selectedYear}&year_group_id=${selectedYg}`,
      { silent: true },
    )
      .then((res) => setCurriculumSubjectIds(new Set(res.data.map((r) => r.subject.id))))
      .catch((err) => {
        console.error('[CompetenciesPage.curriculum]', err);
        setCurriculumSubjectIds(new Set());
      });
  }, [selectedYear, selectedYg]);

  const fetchCompetencies = React.useCallback(async () => {
    if (!selectedYear || !selectedYg) return;
    setIsLoadingBoard(true);
    try {
      const res = await apiClient<{ data: Competency[] }>(
        `/api/v1/scheduling/teacher-competencies?academic_year_id=${selectedYear}&year_group_id=${selectedYg}`,
        { silent: true },
      );
      setCompetencies(res.data);
    } catch (err) {
      console.error('[CompetenciesPage.fetch]', err);
      setCompetencies([]);
    } finally {
      setIsLoadingBoard(false);
    }
  }, [selectedYear, selectedYg]);

  React.useEffect(() => {
    void fetchCompetencies();
  }, [fetchCompetencies]);

  React.useEffect(() => {
    setActiveTab(POOL_TAB);
  }, [selectedYg]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const findCompetency = (teacherId: string, subjectId: string, classId: string | null) =>
    competencies.find(
      (c) =>
        c.staff_profile_id === teacherId &&
        c.subject_id === subjectId &&
        c.year_group_id === selectedYg &&
        (c.class_id ?? null) === (classId ?? null),
    );

  const togglePool = async (teacherId: string, subjectId: string) => {
    const existing = findCompetency(teacherId, subjectId, null);
    try {
      if (existing) {
        await apiClient(`/api/v1/scheduling/teacher-competencies/${existing.id}`, {
          method: 'DELETE',
          silent: true,
        });
        setCompetencies((prev) => prev.filter((c) => c.id !== existing.id));
        toast.success(tv('poolRemoved'));
      } else {
        const res = await apiClient<{ data: Competency }>(
          '/api/v1/scheduling/teacher-competencies',
          {
            method: 'POST',
            silent: true,
            body: JSON.stringify({
              academic_year_id: selectedYear,
              staff_profile_id: teacherId,
              subject_id: subjectId,
              year_group_id: selectedYg,
              class_id: null,
            }),
          },
        );
        setCompetencies((prev) => [...prev, res.data]);
        toast.success(tv('poolSaved'));
      }
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : tc('errorGeneric');
      console.error('[CompetenciesPage.togglePool]', err);
      toast.error(msg);
    }
  };

  /**
   * teacherId === null clears the pin. Otherwise any existing pin for
   * (class, subject) is deleted before POSTing the new one — the unique
   * index allows at most one pin per (class, subject) across teachers.
   */
  const setPin = async (classId: string, subjectId: string, teacherId: string | null) => {
    const existingPin = competencies.find(
      (c) => c.class_id === classId && c.subject_id === subjectId && c.year_group_id === selectedYg,
    );
    try {
      if (existingPin && existingPin.staff_profile_id === teacherId) return;
      if (existingPin) {
        await apiClient(`/api/v1/scheduling/teacher-competencies/${existingPin.id}`, {
          method: 'DELETE',
          silent: true,
        });
        setCompetencies((prev) => prev.filter((c) => c.id !== existingPin.id));
      }
      if (teacherId === null) {
        toast.success(tv('pinCleared'));
        return;
      }
      const res = await apiClient<{ data: Competency }>('/api/v1/scheduling/teacher-competencies', {
        method: 'POST',
        silent: true,
        body: JSON.stringify({
          academic_year_id: selectedYear,
          staff_profile_id: teacherId,
          subject_id: subjectId,
          year_group_id: selectedYg,
          class_id: classId,
        }),
      });
      setCompetencies((prev) => [...prev, res.data]);
      toast.success(tv('pinReplaced'));
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : tc('errorGeneric');
      console.error('[CompetenciesPage.setPin]', err);
      toast.error(msg);
      void fetchCompetencies();
    }
  };

  const handleCopyFromYear = async (sourceYearId: string) => {
    if (!selectedYear) return;
    try {
      await apiClient('/api/v1/scheduling/teacher-competencies/copy', {
        method: 'POST',
        body: JSON.stringify({
          source_academic_year_id: sourceYearId,
          target_academic_year_id: selectedYear,
        }),
      });
      toast.success(tv('copiedFromYear'));
      void fetchCompetencies();
    } catch (err) {
      console.error('[CompetenciesPage.copyFromYear]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const subjectHasAnyCompetency = (subjectId: string) =>
    competencies.some((c) => c.subject_id === subjectId && c.year_group_id === selectedYg);

  const pooledTeacherIdsForSubject = (subjectId: string) =>
    new Set(
      competencies
        .filter(
          (c) =>
            c.subject_id === subjectId && c.year_group_id === selectedYg && c.class_id === null,
        )
        .map((c) => c.staff_profile_id),
    );

  const pinFor = (classId: string, subjectId: string) =>
    competencies.find(
      (c) => c.class_id === classId && c.subject_id === subjectId && c.year_group_id === selectedYg,
    );

  const selectedYgName = yearGroups.find((yg) => yg.id === selectedYg)?.name ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        title={tv('competencies')}
        description={tv('competenciesDesc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder={tv('selectAcademicYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => void handleCopyFromYear(v)}>
              <SelectTrigger className="w-full sm:w-auto h-8 text-xs">
                <Copy className="me-1.5 h-3 w-3" />
                <SelectValue placeholder={tv('copyFromYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears
                  .filter((y) => y.id !== selectedYear)
                  .map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface-secondary/40 px-4 py-2 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> {tv('legendPool')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />{' '}
          {tv('legendPin')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />{' '}
          {tv('legendMissing')}
        </span>
      </div>

      {/* Year group picker */}
      <div className="flex flex-wrap items-center gap-2">
        {yearGroups.map((yg) => {
          const active = yg.id === selectedYg;
          return (
            <button
              key={yg.id}
              type="button"
              onClick={() => setSelectedYg(yg.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              {yg.name}
            </button>
          );
        })}
      </div>

      {!selectedYg && (
        <div className="rounded-2xl border border-border px-4 py-12 text-center text-text-tertiary">
          {tv('selectYearGroupFirstCompetencies')}
        </div>
      )}

      {selectedYg && matrixSubjects.length === 0 && !isLoadingBoard && (
        <div className="rounded-2xl border border-border px-4 py-12 text-center text-text-tertiary">
          {tv('noCurriculumSubjects')}
        </div>
      )}

      {selectedYg && matrixSubjects.length > 0 && (
        <div className="space-y-4">
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            <TabButton
              active={activeTab === POOL_TAB}
              onClick={() => setActiveTab(POOL_TAB)}
              label={tv('poolTab')}
            />
            {classesForYg.map((cls) => (
              <TabButton
                key={cls.id}
                active={activeTab === cls.id}
                onClick={() => setActiveTab(cls.id)}
                label={cls.name}
              />
            ))}
            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-secondary transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                {tv('copyToOtherYears')}
              </button>
            </div>
          </div>

          {activeTab === POOL_TAB && (
            <PoolMatrix
              subjects={matrixSubjects}
              teachers={teacherRoleStaff}
              isLoading={isLoadingBoard}
              isTicked={(teacherId, subjectId) => !!findCompetency(teacherId, subjectId, null)}
              onToggle={togglePool}
              subjectHasAnyCompetency={subjectHasAnyCompetency}
              t={{
                teacherName: tv('teacherName'),
                missing: tv('noTeacherForSubject'),
                loading: tc('loading'),
              }}
            />
          )}

          {activeTab !== POOL_TAB && classesForYg.find((c) => c.id === activeTab) && (
            <PinMatrix
              classId={activeTab}
              subjects={matrixSubjects}
              teachers={teacherRoleStaff}
              isLoading={isLoadingBoard}
              pinFor={pinFor}
              pooledTeacherIdsForSubject={pooledTeacherIdsForSubject}
              subjectHasAnyCompetency={subjectHasAnyCompetency}
              onSet={setPin}
              t={{
                subject: tv('subject'),
                teacher: tv('teacherName'),
                pinned: tv('pinLabel'),
                none: tv('selectTeacherNone'),
                pooled: tv('pooledTeachers'),
                others: tv('otherTeachers'),
                select: tv('selectTeacher'),
                missing: tv('noTeacherForSubject'),
                loading: tc('loading'),
              }}
            />
          )}
        </div>
      )}

      <CopyWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        sourceYearGroupId={selectedYg}
        availableYearGroups={availableYearGroups}
        academicYearId={selectedYear}
        subjects={subjects}
        sourceCurriculumSubjectIds={curriculumSubjectIds}
        onCopied={() => void fetchCompetencies()}
        t={{
          title: tv('copyWizardTitle'),
          step1Desc: tv('copyWizardStep1Desc', { source: selectedYgName }),
          step2Title: tv('copyWizardStep2Title'),
          step2Desc: tv('copyWizardStep2Desc', { source: selectedYgName }),
          targetYear: tv('targetYear'),
          mergeNote: tv('mergeNote'),
          next: tv('next'),
          back: tv('back'),
          cancel: tc('cancel'),
          loading: tc('loading'),
          copyCount: (n) => tv('copyNAssignments', { count: n }),
          copiedToast: (copied, skipped) => tv('copiedToYears', { copied, skipped }),
          errorGeneric: tc('errorGeneric'),
        }}
      />
    </div>
  );
}

// ─── Local sub-components ─────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-text-tertiary hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  );
}
