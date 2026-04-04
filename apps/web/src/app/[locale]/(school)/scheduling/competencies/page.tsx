'use client';

import { AlertTriangle, Copy, Lock, Star, Unlock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}
interface YearGroup {
  id: string;
  name: string;
}
interface Subject {
  id: string;
  name: string;
}
interface StaffProfile {
  id: string;
  name: string;
  roles: string[];
}

interface Competency {
  id: string;
  staff_profile_id: string;
  subject_id: string;
  year_group_id: string;
  is_primary: boolean;
}

type TabKey = 'byTeacher' | 'bySubject';

const UNLOCK_ROLES = ['school_principal', 'school_owner'] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetenciesPage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');
  const { user } = useAuth();

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [teachers, setTeachers] = React.useState<StaffProfile[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<TabKey>('byTeacher');
  const [competencies, setCompetencies] = React.useState<Competency[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Lock state
  const [isLocked, setIsLocked] = React.useState(true);
  const userRoleKeys = React.useMemo(() => {
    if (!user?.memberships) return [] as string[];
    return user.memberships.flatMap(
      (m) => m.roles?.map((r: { role_key: string }) => r.role_key) ?? [],
    );
  }, [user]);
  const canUnlock = React.useMemo(
    () => userRoleKeys.some((k) => UNLOCK_ROLES.includes(k as (typeof UNLOCK_ROLES)[number])),
    [userRoleKeys],
  );

  // By Teacher view — filter by year group
  const [selectedTeacherTabYg, setSelectedTeacherTabYg] = React.useState('');
  // By Subject view
  const [selectedSubject, setSelectedSubject] = React.useState('');
  const [selectedYearGroup, setSelectedYearGroup] = React.useState('');

  // ─── Copy Wizard State ────────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardStep, setWizardStep] = React.useState<1 | 2>(1);
  const [wizardTargets, setWizardTargets] = React.useState<Set<string>>(new Set());
  // Map: yearGroupId -> Set of subjectIds available in that target
  const [wizardTargetSubjects, setWizardTargetSubjects] = React.useState<Map<string, Set<string>>>(
    new Map(),
  );
  // Map: "ygId:subjectId" -> checked
  const [wizardSelections, setWizardSelections] = React.useState<Map<string, boolean>>(new Map());
  const [wizardLoading, setWizardLoading] = React.useState(false);

  // Subjects assigned to the selected year group via the curriculum matrix
  const [curriculumSubjectIds, setCurriculumSubjectIds] = React.useState<Set<string>>(new Set());

  // Only staff with "Teacher" role for the matrix rows
  const teacherRoleStaff = React.useMemo(
    () => teachers.filter((t) => t.roles.some((r) => r.toLowerCase() === 'teacher')),
    [teachers],
  );

  // Subjects filtered to only those in the curriculum for the selected year group
  const matrixSubjects = React.useMemo(
    () =>
      curriculumSubjectIds.size > 0 ? subjects.filter((s) => curriculumSubjectIds.has(s.id)) : [],
    [subjects, curriculumSubjectIds],
  );

  // ─── Lock Toggle ──────────────────────────────────────────────────────────

  const handleToggleLock = () => {
    if (isLocked) {
      if (!canUnlock) {
        toast.error(tv('lockPermissionDenied'));
        return;
      }
      setIsLocked(false);
    } else {
      setIsLocked(true);
    }
  };

  // ─── Data Loading ─────────────────────────────────────────────────────────

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
      })
      .catch((err) => { console.error('[SchedulingCompetenciesPage]', err); return toast.error(tc('errorGeneric')); });
  }, [tc]);

  // Fetch subjects assigned to classes in this year group
  React.useEffect(() => {
    if (!selectedYear || !selectedTeacherTabYg) {
      setCurriculumSubjectIds(new Set());
      return;
    }
    apiClient<{ data: Array<{ subject: { id: string } }> }>(
      `/api/v1/scheduling/curriculum-requirements/matrix-subjects?academic_year_id=${selectedYear}&year_group_id=${selectedTeacherTabYg}`,
      { silent: true },
    )
      .then((res) => {
        setCurriculumSubjectIds(new Set(res.data.map((r) => r.subject.id)));
      })
      .catch((err) => { console.error('[SchedulingCompetenciesPage]', err); return setCurriculumSubjectIds(new Set()); });
  }, [selectedYear, selectedTeacherTabYg]);

  // Fetch competencies
  const fetchCompetencies = React.useCallback(async () => {
    if (!selectedYear) return;
    setIsLoading(true);
    try {
      let url: string;
      if (activeTab === 'bySubject' && selectedSubject && selectedYearGroup) {
        url = `/api/v1/scheduling/teacher-competencies/by-subject?academic_year_id=${selectedYear}&subject_id=${selectedSubject}&year_group_id=${selectedYearGroup}`;
      } else {
        url = `/api/v1/scheduling/teacher-competencies?academic_year_id=${selectedYear}`;
      }
      const res = await apiClient<{ data: Competency[] }>(url, { silent: true });
      setCompetencies(res.data);
    } catch (err) {
      console.error('[SchedulingCompetenciesPage]', err);
      setCompetencies([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, activeTab, selectedSubject, selectedYearGroup]);

  React.useEffect(() => {
    void fetchCompetencies();
  }, [fetchCompetencies]);

  // ─── Competency Actions ───────────────────────────────────────────────────

  const toggleCompetencyMatrix = async (
    teacherId: string,
    subjectId: string,
    yearGroupId: string,
  ) => {
    if (!selectedYear || isLocked) return;
    const existing = competencies.find(
      (c) =>
        c.staff_profile_id === teacherId &&
        c.subject_id === subjectId &&
        c.year_group_id === yearGroupId,
    );
    try {
      if (existing) {
        await apiClient(`/api/v1/scheduling/teacher-competencies/${existing.id}`, {
          method: 'DELETE',
          silent: true,
        });
        setCompetencies((prev) => prev.filter((c) => c.id !== existing.id));
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
              year_group_id: yearGroupId,
              is_primary: false,
            }),
          },
        );
        setCompetencies((prev) => [...prev, res.data]);
      }
    } catch (err) {
      console.error('[SchedulingCompetenciesPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const togglePrimary = async (competency: Competency) => {
    if (isLocked) return;
    try {
      await apiClient(`/api/v1/scheduling/teacher-competencies/${competency.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_primary: !competency.is_primary }),
      });
      setCompetencies((prev) =>
        prev.map((c) => (c.id === competency.id ? { ...c, is_primary: !c.is_primary } : c)),
      );
    } catch (err) {
      console.error('[SchedulingCompetenciesPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleCopyFromYear = async (sourceYearId: string) => {
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
      console.error('[SchedulingCompetenciesPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  // ─── Copy Wizard Logic ────────────────────────────────────────────────────

  const openWizard = () => {
    setWizardStep(1);
    setWizardTargets(new Set());
    setWizardTargetSubjects(new Map());
    setWizardSelections(new Map());
    setWizardOpen(true);
  };

  const wizardToggleTarget = (ygId: string) => {
    setWizardTargets((prev) => {
      const next = new Set(prev);
      if (next.has(ygId)) next.delete(ygId);
      else next.add(ygId);
      return next;
    });
  };

  const wizardGoToStep2 = async () => {
    if (wizardTargets.size === 0) return;
    setWizardLoading(true);
    try {
      // Fetch curriculum subjects for each target year group
      const targetIds = [...wizardTargets];
      const results = await Promise.all(
        targetIds.map((ygId) =>
          apiClient<{ data: Array<{ subject: { id: string } }> }>(
            `/api/v1/scheduling/curriculum-requirements/matrix-subjects?academic_year_id=${selectedYear}&year_group_id=${ygId}`,
            { silent: true },
          ).then((res) => ({
            ygId,
            subjectIds: new Set(res.data.map((r) => r.subject.id)),
          })),
        ),
      );

      const targetSubMap = new Map<string, Set<string>>();
      const selections = new Map<string, boolean>();

      for (const { ygId, subjectIds } of results) {
        // Only include subjects that are common with the source year group
        const commonIds = new Set([...subjectIds].filter((sid) => curriculumSubjectIds.has(sid)));
        targetSubMap.set(ygId, commonIds);

        // Default all applicable cells to checked
        for (const sid of commonIds) {
          selections.set(`${ygId}:${sid}`, true);
        }
      }

      setWizardTargetSubjects(targetSubMap);
      setWizardSelections(selections);
      setWizardStep(2);
    } catch (err) {
      console.error('[SchedulingCompetenciesPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setWizardLoading(false);
    }
  };

  // Unique subjects across all selected targets (for grid columns)
  const wizardCommonSubjects = React.useMemo(() => {
    const allSubjectIds = new Set<string>();
    for (const subs of wizardTargetSubjects.values()) {
      for (const sid of subs) allSubjectIds.add(sid);
    }
    return subjects.filter((s) => allSubjectIds.has(s.id));
  }, [wizardTargetSubjects, subjects]);

  const wizardToggleCell = (ygId: string, subjectId: string) => {
    const key = `${ygId}:${subjectId}`;
    setWizardSelections((prev) => {
      const next = new Map(prev);
      next.set(key, !prev.get(key));
      return next;
    });
  };

  const wizardSelectedCount = React.useMemo(() => {
    let count = 0;
    for (const v of wizardSelections.values()) if (v) count++;
    return count;
  }, [wizardSelections]);

  const handleWizardCopy = async () => {
    // Build targets array from selections
    const targetsMap = new Map<string, string[]>();
    for (const [key, checked] of wizardSelections) {
      if (!checked) continue;
      const idx = key.indexOf(':');
      const ygId = key.slice(0, idx);
      const subjectId = key.slice(idx + 1);
      if (!targetsMap.has(ygId)) targetsMap.set(ygId, []);
      targetsMap.get(ygId)!.push(subjectId);
    }

    const targets = [...targetsMap.entries()].map(([year_group_id, subject_ids]) => ({
      year_group_id,
      subject_ids,
    }));

    if (targets.length === 0) return;

    setWizardLoading(true);
    try {
      const res = await apiClient<{ data: { copied: number; skipped: number } }>(
        '/api/v1/scheduling/teacher-competencies/copy-to-years',
        {
          method: 'POST',
          body: JSON.stringify({
            academic_year_id: selectedYear,
            source_year_group_id: selectedTeacherTabYg,
            targets,
          }),
        },
      );
      toast.success(tv('copiedToYears', { copied: res.data.copied, skipped: res.data.skipped }));
      setWizardOpen(false);
      void fetchCompetencies();
    } catch (err) {
      console.error('[SchedulingCompetenciesPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setWizardLoading(false);
    }
  };

  // Year groups available as wizard targets (all except the source)
  const wizardAvailableYearGroups = React.useMemo(
    () => yearGroups.filter((yg) => yg.id !== selectedTeacherTabYg),
    [yearGroups, selectedTeacherTabYg],
  );

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const eligibleTeachersForSubjectYg = (subjectId: string, yearGroupId: string) =>
    competencies.filter((c) => c.subject_id === subjectId && c.year_group_id === yearGroupId);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'byTeacher', label: tv('byTeacher') },
    { key: 'bySubject', label: tv('bySubject') },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

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

      {/* Tab Nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* By Teacher view */}
      {activeTab === 'byTeacher' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedTeacherTabYg} onValueChange={setSelectedTeacherTabYg}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={tv('selectYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {yearGroups.map((yg) => (
                  <SelectItem key={yg.id} value={yg.id}>
                    {yg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Copy to Other Years button — only when unlocked and data exists */}
            {selectedTeacherTabYg && !isLocked && matrixSubjects.length > 0 && (
              <button
                type="button"
                onClick={openWizard}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                {tv('copyToOtherYears')}
              </button>
            )}

            <div className="flex-1" />

            {/* Lock/Unlock button */}
            <button
              type="button"
              onClick={handleToggleLock}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                isLocked
                  ? 'border-border text-text-secondary hover:bg-surface-secondary'
                  : 'border-primary bg-primary/5 text-primary'
              }`}
            >
              {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {isLocked ? tv('locked') : tv('unlocked')}
            </button>
          </div>

          {selectedTeacherTabYg && teacherRoleStaff.length > 0 && matrixSubjects.length > 0 && (
            <div
              className={`rounded-2xl border border-border overflow-hidden transition-opacity ${isLocked ? 'opacity-60' : ''}`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-secondary">
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase sticky start-0 bg-surface-secondary z-10 min-w-[180px]">
                        {tv('teacherName')}
                      </th>
                      {matrixSubjects.map((subject) => (
                        <th
                          key={subject.id}
                          className="px-3 py-3 text-center text-xs font-medium text-text-tertiary uppercase"
                        >
                          {subject.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={matrixSubjects.length + 1}
                          className="px-4 py-8 text-center text-text-tertiary"
                        >
                          {tc('loading')}
                        </td>
                      </tr>
                    ) : (
                      teacherRoleStaff.map((teacher) => (
                        <tr
                          key={teacher.id}
                          className="border-t border-border hover:bg-surface-secondary/50"
                        >
                          <td className="px-4 py-2 font-medium text-text-primary sticky start-0 bg-surface z-10">
                            {teacher.name}
                          </td>
                          {matrixSubjects.map((subject) => {
                            const comp = competencies.find(
                              (c) =>
                                c.staff_profile_id === teacher.id &&
                                c.subject_id === subject.id &&
                                c.year_group_id === selectedTeacherTabYg,
                            );
                            return (
                              <td key={subject.id} className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Checkbox
                                    checked={!!comp}
                                    disabled={isLocked}
                                    onCheckedChange={() =>
                                      void toggleCompetencyMatrix(
                                        teacher.id,
                                        subject.id,
                                        selectedTeacherTabYg,
                                      )
                                    }
                                  />
                                  {comp && !isLocked && (
                                    <button
                                      type="button"
                                      onClick={() => void togglePrimary(comp)}
                                      className={`transition-colors ${comp.is_primary ? 'text-amber-500' : 'text-text-tertiary hover:text-amber-400'}`}
                                      title={tv('primary')}
                                    >
                                      <Star
                                        className={`h-3.5 w-3.5 ${comp.is_primary ? 'fill-current' : ''}`}
                                      />
                                    </button>
                                  )}
                                  {comp && isLocked && comp.is_primary && (
                                    <Star className="h-3.5 w-3.5 text-amber-500 fill-current" />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedTeacherTabYg &&
            teacherRoleStaff.length > 0 &&
            matrixSubjects.length === 0 &&
            !isLoading && (
              <div className="rounded-2xl border border-border px-4 py-8 text-center text-text-tertiary">
                {tv('noCurriculumSubjects')}
              </div>
            )}

          {selectedTeacherTabYg && teacherRoleStaff.length === 0 && (
            <div className="rounded-2xl border border-border px-4 py-8 text-center text-text-tertiary">
              {tv('noTeachers')}
            </div>
          )}
        </div>
      )}

      {/* By Subject view */}
      {activeTab === 'bySubject' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={tv('selectSubject')} />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYearGroup} onValueChange={setSelectedYearGroup}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={tv('selectYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {yearGroups.map((yg) => (
                  <SelectItem key={yg.id} value={yg.id}>
                    {yg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSubject && selectedYearGroup && (
            <div className="space-y-3">
              {(() => {
                const eligible = eligibleTeachersForSubjectYg(selectedSubject, selectedYearGroup);
                const subjectName = subjects.find((s) => s.id === selectedSubject)?.name ?? '';
                const ygName = yearGroups.find((yg) => yg.id === selectedYearGroup)?.name ?? '';
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-secondary">
                      {ygName} {subjectName}: {eligible.length} {tv('eligible')}
                    </span>
                    {eligible.length === 0 && (
                      <Badge variant="danger" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {tv('noTeachers')}
                      </Badge>
                    )}
                  </div>
                );
              })()}

              <div className="rounded-2xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">
                          {tv('teacherName')}
                        </th>
                        <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">
                          {tv('primary')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-8 text-center text-text-tertiary">
                            {tc('loading')}
                          </td>
                        </tr>
                      ) : (
                        (() => {
                          const eligible = competencies.filter(
                            (c) =>
                              c.subject_id === selectedSubject &&
                              c.year_group_id === selectedYearGroup,
                          );
                          if (eligible.length === 0) {
                            return (
                              <tr>
                                <td
                                  colSpan={2}
                                  className="px-4 py-8 text-center text-text-tertiary"
                                >
                                  {tv('noTeachers')}
                                </td>
                              </tr>
                            );
                          }
                          return eligible.map((comp) => {
                            const teacher = teachers.find((t) => t.id === comp.staff_profile_id);
                            return (
                              <tr
                                key={comp.id}
                                className="border-t border-border hover:bg-surface-secondary/50"
                              >
                                <td className="px-4 py-3 font-medium text-text-primary">
                                  {teacher?.name ?? '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {comp.is_primary ? (
                                    <Star className="h-4 w-4 text-amber-500 fill-current" />
                                  ) : (
                                    <span className="text-text-tertiary">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Copy Wizard Dialog ──────────────────────────────────────────────── */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-lg">
          {wizardStep === 1 && (
            <>
              <DialogHeader>
                <DialogTitle>{tv('copyWizardTitle')}</DialogTitle>
                <DialogDescription>
                  {tv('copyWizardStep1Desc', {
                    source: yearGroups.find((yg) => yg.id === selectedTeacherTabYg)?.name ?? '',
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 py-2 max-h-[40vh] overflow-y-auto">
                {wizardAvailableYearGroups.map((yg) => {
                  const isSelected = wizardTargets.has(yg.id);
                  return (
                    <label
                      key={yg.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-surface-secondary'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => wizardToggleTarget(yg.id)}
                      />
                      <span className="text-sm font-medium">{yg.name}</span>
                    </label>
                  );
                })}
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setWizardOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-secondary transition-colors"
                >
                  {tc('cancel')}
                </button>
                <button
                  type="button"
                  disabled={wizardTargets.size === 0 || wizardLoading}
                  onClick={() => void wizardGoToStep2()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {wizardLoading ? tc('loading') : tv('next')}
                </button>
              </DialogFooter>
            </>
          )}

          {wizardStep === 2 && (
            <>
              <DialogHeader>
                <DialogTitle>{tv('copyWizardStep2Title')}</DialogTitle>
                <DialogDescription>
                  {tv('copyWizardStep2Desc', {
                    source: yearGroups.find((yg) => yg.id === selectedTeacherTabYg)?.name ?? '',
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-secondary">
                      <th className="px-3 py-2 text-start text-xs font-medium text-text-tertiary uppercase sticky start-0 bg-surface-secondary z-10">
                        {tv('targetYear')}
                      </th>
                      {wizardCommonSubjects.map((s) => (
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
                    {[...wizardTargets].map((ygId) => {
                      const yg = yearGroups.find((y) => y.id === ygId);
                      const targetSubs = wizardTargetSubjects.get(ygId) ?? new Set<string>();
                      return (
                        <tr key={ygId} className="border-t border-border">
                          <td className="px-3 py-2 font-medium text-text-primary sticky start-0 bg-surface z-10 whitespace-nowrap">
                            {yg?.name ?? ''}
                          </td>
                          {wizardCommonSubjects.map((s) => {
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
                                  checked={!!wizardSelections.get(key)}
                                  onCheckedChange={() => wizardToggleCell(ygId, s.id)}
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
                {tv('mergeNote')}
              </div>

              <DialogFooter className="flex-row justify-between sm:justify-between">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-secondary transition-colors"
                >
                  {tv('back')}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardOpen(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-secondary transition-colors"
                  >
                    {tc('cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={wizardSelectedCount === 0 || wizardLoading}
                    onClick={() => void handleWizardCopy()}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {wizardLoading
                      ? tc('loading')
                      : tv('copyNAssignments', { count: wizardSelectedCount })}
                  </button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
