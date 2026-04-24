import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'attendance_record.status.status',
    label_key: 'reports.fields.attendance_record.status.status',
    domain: 'status',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['present', 'absent_unexcused', 'absent_excused', 'late', 'left_early'],
    resolver: 'status',
  },
  {
    id: 'attendance_record.status.reason',
    label_key: 'reports.fields.attendance_record.status.reason',
    domain: 'status',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'reason',
  },
  {
    id: 'attendance_record.student.first_name',
    label_key: 'reports.fields.attendance_record.student.first_name',
    domain: 'student',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_first_name',
  },
  {
    id: 'attendance_record.student.last_name',
    label_key: 'reports.fields.attendance_record.student.last_name',
    domain: 'student',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_last_name',
  },
  {
    id: 'attendance_record.timing.marked_at',
    label_key: 'reports.fields.attendance_record.timing.marked_at',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'marked_at',
  },
  {
    id: 'attendance_record.timing.arrival_time',
    label_key: 'reports.fields.attendance_record.timing.arrival_time',
    domain: 'timing',
    type: 'string',
    filterable: false,
    groupable: false,
    resolver: 'arrival_time',
  },
  {
    id: 'attendance_record.audit.created_at',
    label_key: 'reports.fields.attendance_record.audit.created_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'attendance_record',
  label_key: 'reports.subjects.attendance_record.label',
  icon_name: 'ClipboardCheck',
  primary_model: 'AttendanceRecord',
  fields,
};

type AttendanceRecordRow = {
  id: string;
  status: string;
  reason: string | null;
  arrival_time: string | null;
  marked_at: Date;
  created_at: Date;
  student: { id: string; first_name: string; last_name: string } | null;
};

export const ATTENDANCE_RECORD_ADAPTER: SubjectAdapter = buildAdapter<AttendanceRecordRow>({
  descriptor,
  filterColumnMap: {
    'attendance_record.status.status': 'status',
    'attendance_record.status.reason': 'reason',
    'attendance_record.student.first_name': 'student.first_name',
    'attendance_record.student.last_name': 'student.last_name',
    'attendance_record.timing.marked_at': 'marked_at',
    'attendance_record.audit.created_at': 'created_at',
  },
  selectFragment: {
    id: true,
    status: true,
    reason: true,
    arrival_time: true,
    marked_at: true,
    created_at: true,
    student: { select: { id: true, first_name: true, last_name: true } },
  },
  defaultOrderBy: [{ marked_at: 'desc' }],
  getDelegate: (tx) => tx.attendanceRecord as unknown as PrismaDelegate,
  resolvers: {
    status: (r) => r.status,
    reason: (r) => r.reason,
    student_first_name: (r) => r.student?.first_name ?? null,
    student_last_name: (r) => r.student?.last_name ?? null,
    marked_at: (r) => r.marked_at,
    arrival_time: (r) => r.arrival_time,
    created_at: (r) => r.created_at,
  },
});
