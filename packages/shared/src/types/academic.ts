export type AcademicYearStatus = 'planned' | 'active' | 'closed';

export type AcademicPeriodType = 'term' | 'semester' | 'quarter' | 'custom';
export type AcademicPeriodStatus = 'planned' | 'active' | 'closed';

export type SubjectType = 'core' | 'elective' | 'extracurricular';

export interface AcademicYear {
  id: string;
  tenant_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: AcademicYearStatus;
  created_at: string;
  updated_at: string;
}

export interface AcademicPeriod {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  name: string;
  period_type: AcademicPeriodType;
  start_date: string;
  end_date: string;
  status: AcademicPeriodStatus;
  created_at: string;
  updated_at: string;
}

export interface AcademicYearDetail extends AcademicYear {
  periods: AcademicPeriod[];
}

export interface YearGroup {
  id: string;
  tenant_id: string;
  name: string;
  display_order: number;
  next_year_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  subject_type: SubjectType | null;
  created_at: string;
  updated_at: string;
}
