'use client';

import {
  Badge,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { AlertTriangle, Copy, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear { id: string; name: string }
interface YearGroup { id: string; name: string }
interface Subject { id: string; name: string }
interface StaffProfile { id: string; name: string; roles: string[] }

interface Competency {
  id: string;
  staff_profile_id: string;
  subject_id: string;
  year_group_id: string;
  is_primary: boolean;
}

type TabKey = 'byTeacher' | 'bySubject';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetenciesPage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [teachers, setTeachers] = React.useState<StaffProfile[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<TabKey>('byTeacher');
  const [competencies, setCompetencies] = React.useState<Competency[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // By Teacher view — filter by year group
  const [selectedTeacherTabYg, setSelectedTeacherTabYg] = React.useState('');
  // By Subject view
  const [selectedSubject, setSelectedSubject] = React.useState('');
  const [selectedYearGroup, setSelectedYearGroup] = React.useState('');

  // Only staff with "Teacher" role for the matrix columns
  const teacherRoleStaff = React.useMemo(
    () => teachers.filter((t) => t.roles.some((r) => r.toLowerCase() === 'teacher')),
    [teachers],
  );

  // Load reference data
  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
      apiClient<{ data: Subject[] }>('/api/v1/subjects?pageSize=100'),
      apiClient<{ data: Array<{ id: string; user?: { first_name: string; last_name: string }; roles?: string[] }>; meta: { total: number } }>('/api/v1/staff-profiles?pageSize=100'),
    ]).then(async ([yearsRes, ygRes, subRes, staffRes]) => {
      setAcademicYears(yearsRes.data);
      setYearGroups(ygRes.data);
      setSubjects(subRes.data);

      // Fetch all pages of staff profiles if more than 100
      let allStaff = staffRes.data ?? [];
      const total = staffRes.meta?.total ?? allStaff.length;
      if (total > 100) {
        const remaining = await apiClient<{ data: typeof allStaff }>('/api/v1/staff-profiles?pageSize=100&page=2');
        allStaff = [...allStaff, ...(remaining.data ?? [])];
      }

      setTeachers(allStaff.map((s) => ({
        id: s.id,
        name: s.user ? `${s.user.first_name} ${s.user.last_name}` : s.id,
        roles: s.roles ?? [],
      })));
      if (yearsRes.data[0]) setSelectedYear(yearsRes.data[0].id);
    }).catch(() => toast.error(tc('errorGeneric')));
  }, [tc]);

  // Fetch competencies — load all for byTeacher matrix, filtered for bySubject
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
      const res = await apiClient<{ data: Competency[] }>(url);
      setCompetencies(res.data);
    } catch {
      setCompetencies([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, activeTab, selectedSubject, selectedYearGroup]);

  React.useEffect(() => {
    void fetchCompetencies();
  }, [fetchCompetencies]);

  // Toggle competency in the matrix (By Teacher view)
  const toggleCompetencyMatrix = async (
    teacherId: string,
    subjectId: string,
    yearGroupId: string,
  ) => {
    if (!selectedYear) return;
    const existing = competencies.find(
      (c) =>
        c.staff_profile_id === teacherId &&
        c.subject_id === subjectId &&
        c.year_group_id === yearGroupId,
    );
    try {
      if (existing) {
        await apiClient(
          `/api/v1/scheduling/teacher-competencies/${existing.id}`,
          { method: 'DELETE' },
        );
        setCompetencies((prev) => prev.filter((c) => c.id !== existing.id));
      } else {
        const created = await apiClient<Competency>(
          '/api/v1/scheduling/teacher-competencies',
          {
            method: 'POST',
            body: JSON.stringify({
              academic_year_id: selectedYear,
              staff_profile_id: teacherId,
              subject_id: subjectId,
              year_group_id: yearGroupId,
              is_primary: false,
            }),
          },
        );
        setCompetencies((prev) => [...prev, created]);
      }
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const togglePrimary = async (competency: Competency) => {
    try {
      await apiClient(
        `/api/v1/scheduling/teacher-competencies/${competency.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ is_primary: !competency.is_primary }),
        },
      );
      setCompetencies((prev) =>
        prev.map((c) =>
          c.id === competency.id ? { ...c, is_primary: !c.is_primary } : c,
        ),
      );
    } catch {
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
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  // Coverage warnings for "By Subject" view
  const eligibleTeachersForSubjectYg = (subjectId: string, yearGroupId: string) =>
    competencies.filter((c) => c.subject_id === subjectId && c.year_group_id === yearGroupId);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'byTeacher', label: tv('byTeacher') },
    { key: 'bySubject', label: tv('bySubject') },
  ];

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
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => void handleCopyFromYear(v)}>
              <SelectTrigger className="w-full sm:w-auto h-8 text-xs">
                <Copy className="me-1.5 h-3 w-3" />
                <SelectValue placeholder={tv('copyFromYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.filter((y) => y.id !== selectedYear).map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
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

      {/* By Teacher view — matrix: teachers (rows) × subjects (columns), filtered by year group */}
      {activeTab === 'byTeacher' && (
        <div className="space-y-4">
          <Select value={selectedTeacherTabYg} onValueChange={setSelectedTeacherTabYg}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={tv('selectYearGroup')} />
            </SelectTrigger>
            <SelectContent>
              {yearGroups.map((yg) => (
                <SelectItem key={yg.id} value={yg.id}>{yg.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTeacherTabYg && teacherRoleStaff.length > 0 && (
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-secondary">
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase sticky start-0 bg-surface-secondary z-10 min-w-[180px]">
                        {tv('teacherName')}
                      </th>
                      {subjects.map((subject) => (
                        <th key={subject.id} className="px-3 py-3 text-center text-xs font-medium text-text-tertiary uppercase">
                          {subject.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={subjects.length + 1}
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
                          {subjects.map((subject) => {
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
                                    onCheckedChange={() =>
                                      void toggleCompetencyMatrix(
                                        teacher.id,
                                        subject.id,
                                        selectedTeacherTabYg,
                                      )
                                    }
                                  />
                                  {comp && (
                                    <button
                                      type="button"
                                      onClick={() => void togglePrimary(comp)}
                                      className={`transition-colors ${comp.is_primary ? 'text-amber-500' : 'text-text-tertiary hover:text-amber-400'}`}
                                      title={tv('primary')}
                                    >
                                      <Star className={`h-3.5 w-3.5 ${comp.is_primary ? 'fill-current' : ''}`} />
                                    </button>
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
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYearGroup} onValueChange={setSelectedYearGroup}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={tv('selectYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {yearGroups.map((yg) => (
                  <SelectItem key={yg.id} value={yg.id}>{yg.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSubject && selectedYearGroup && (
            <div className="space-y-3">
              {/* Coverage indicator */}
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
                        <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('teacherName')}</th>
                        <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('primary')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr><td colSpan={2} className="px-4 py-8 text-center text-text-tertiary">{tc('loading')}</td></tr>
                      ) : (
                        (() => {
                          const eligible = competencies.filter(
                            (c) => c.subject_id === selectedSubject && c.year_group_id === selectedYearGroup
                          );
                          if (eligible.length === 0) {
                            return (
                              <tr><td colSpan={2} className="px-4 py-8 text-center text-text-tertiary">{tv('noTeachers')}</td></tr>
                            );
                          }
                          return eligible.map((comp) => {
                            const teacher = teachers.find((t) => t.id === comp.staff_profile_id);
                            return (
                              <tr key={comp.id} className="border-t border-border hover:bg-surface-secondary/50">
                                <td className="px-4 py-3 font-medium text-text-primary">{teacher?.name ?? '—'}</td>
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
    </div>
  );
}
