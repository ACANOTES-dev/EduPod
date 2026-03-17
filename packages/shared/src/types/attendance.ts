import type { TimetableEntry } from './schedule';

export interface AttendanceSession {
  id: string;
  tenant_id: string;
  class_id: string;
  schedule_id: string | null;
  session_date: string;
  status: string;
  override_reason: string | null;
  submitted_by_user_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  tenant_id: string;
  attendance_session_id: string;
  student_id: string;
  status: string;
  reason: string | null;
  marked_by_user_id: string;
  marked_at: string;
  amended_from_status: string | null;
  amendment_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyAttendanceSummary {
  id: string;
  tenant_id: string;
  student_id: string;
  summary_date: string;
  derived_status: string;
  derived_payload: DerivedPayload;
  created_at: string;
  updated_at: string;
}

export interface DerivedPayload {
  sessions_total: number;
  sessions_present: number;
  sessions_absent: number;
  sessions_late: number;
  sessions_excused: number;
  session_details: Array<{
    session_id: string;
    class_id: string;
    status: string;
  }>;
}

export interface ExceptionDashboardData {
  pending_sessions: Array<{
    session: AttendanceSession;
    class_name: string;
    teacher_name?: string;
    session_date: string;
  }>;
  excessive_absences: Array<{
    student_id: string;
    student_name: string;
    class_homeroom: string;
    absent_count: number;
    period_start: string;
    period_end: string;
  }>;
}

export interface TeacherDashboardData {
  todays_schedule: TimetableEntry[];
  todays_sessions: Array<{
    session: AttendanceSession;
    class_name: string;
    marked_count: number;
    enrolled_count: number;
  }>;
  pending_submissions: number;
}
