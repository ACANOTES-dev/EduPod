import { PrismaClient } from '@prisma/client';

export type Prisma = PrismaClient;

export interface FoundationResult {
  academicYearId: string;
  periodIds: string[]; // [term1, term2, term3]
  yearGroupIds: string[]; // [y1..y6] in order
  yearGroupMap: Map<string, string>; // "Year 1" -> id
  subjectIds: string[];
  subjectMap: Map<string, string>; // code -> id e.g. "MATH" -> uuid
  roomIds: string[];
  roomMap: Map<string, string>; // name -> id
}

export interface StaffInfo {
  userId: string;
  membershipId: string;
  staffProfileId: string;
  subjectCodes: string[];
  isTeacher: boolean;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  employmentType: 'full_time' | 'part_time';
  monthlySalary: number;
}

export interface HouseholdInfo {
  id: string;
  familyName: string;
  studentIds: string[];
  parentIds: string[];
  yearGroupIndices: number[]; // which year groups have students
}

export interface StudentInfo {
  id: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  status: 'active' | 'applicant' | 'withdrawn' | 'archived';
  yearGroupId: string;
  yearGroupIndex: number; // 0-5
  sectionIndex: number; // 0-4 (A-E)
  householdId: string;
  studentNumber: string;
}

export interface PeopleResult {
  ownerUserId: string;
  ownerStaffProfileId: string;
  adminUserId: string;
  staff: StaffInfo[];
  teachersBySubject: Map<string, string[]>; // subject code -> staffProfileId[]
  allTeacherStaffIds: string[];
  households: HouseholdInfo[];
  students: StudentInfo[];
  allStudentIds: string[];
  studentsByYearGroup: Map<string, string[]>; // yearGroupId -> studentId[]
  studentsBySection: Map<string, string[]>; // "Y1A" -> studentId[]
  parentUserIds: string[];
}

export interface ClassInfo {
  id: string;
  name: string;
  yearGroupId: string;
  yearGroupIndex: number;
  subjectId: string | null;
  subjectCode: string | null;
  teacherStaffId: string | null;
  studentIds: string[];
  sectionIndex: number;
}

export interface ClassesResult {
  homerooms: ClassInfo[];
  subjectClasses: ClassInfo[];
  allClasses: ClassInfo[];
}

export const YEAR_GROUP_NAMES = ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'];
export const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];
export const STUDENTS_PER_SECTION = 25;

export const SUBJECT_DEFS = [
  { code: 'ENG', name: 'English', type: 'academic' as const },
  { code: 'MATH', name: 'Mathematics', type: 'academic' as const },
  { code: 'ARB', name: 'Arabic', type: 'academic' as const },
  { code: 'BIO', name: 'Biology', type: 'academic' as const },
  { code: 'CHEM', name: 'Chemistry', type: 'academic' as const },
  { code: 'PHY', name: 'Physics', type: 'academic' as const },
  { code: 'HIST', name: 'History', type: 'academic' as const },
  { code: 'GEO', name: 'Geography', type: 'academic' as const },
  { code: 'BUS', name: 'Business Studies', type: 'academic' as const },
  { code: 'CS', name: 'Computer Science', type: 'academic' as const },
  { code: 'ART', name: 'Art', type: 'academic' as const },
  { code: 'MUS', name: 'Music', type: 'academic' as const },
  { code: 'PE', name: 'Physical Education', type: 'academic' as const },
  { code: 'RS', name: 'Religious Studies', type: 'academic' as const },
  { code: 'HEC', name: 'Home Economics', type: 'academic' as const },
] as const;

// Subjects taken per year group (by code)
// Y1-Y3: all 15, Y4: 12 (lighter), Y5-Y6: 12 offered but students pick ~8
export const SUBJECTS_BY_YEAR: Record<number, string[]> = {
  0: ['ENG','MATH','ARB','BIO','CHEM','PHY','HIST','GEO','CS','ART','MUS','PE','RS','HEC'],
  1: ['ENG','MATH','ARB','BIO','CHEM','PHY','HIST','GEO','CS','ART','MUS','PE','RS','HEC'],
  2: ['ENG','MATH','ARB','BIO','CHEM','PHY','HIST','GEO','CS','ART','MUS','PE','RS','HEC'],
  3: ['ENG','MATH','ARB','BIO','CHEM','PHY','HIST','GEO','BUS','CS','PE','RS'], // Y4 transition - lighter
  4: ['ENG','MATH','ARB','BIO','CHEM','PHY','HIST','GEO','BUS','CS','PE','RS'], // Y5 exam cycle
  5: ['ENG','MATH','ARB','BIO','CHEM','PHY','HIST','GEO','BUS','CS','PE','RS'], // Y6 exam cycle
};

// For Y5-Y6, each student only picks ~8 of the 12. We'll assign deterministically.
export const Y5_Y6_CORE = ['ENG', 'MATH', 'ARB', 'PE']; // mandatory
export const Y5_Y6_ELECTIVES = ['BIO', 'CHEM', 'PHY', 'HIST', 'GEO', 'BUS', 'CS', 'RS'];
export const Y5_Y6_ELECTIVE_PICK = 4; // pick 4 electives = 8 total

// Teacher allocation per subject
export const TEACHER_ALLOCATION: Record<string, number> = {
  ENG: 5, MATH: 5, ARB: 5, BIO: 3, CHEM: 3, PHY: 3,
  HIST: 3, GEO: 3, BUS: 2, CS: 3, ART: 2, MUS: 2, PE: 3, RS: 3, HEC: 2,
};

// Periods per week per subject per year group tier
export const PERIODS_PER_WEEK: Record<string, Record<string, number>> = {
  // tier: junior (Y1-Y3), transition (Y4), senior (Y5-Y6)
  ENG:  { junior: 5, transition: 4, senior: 5 },
  MATH: { junior: 5, transition: 4, senior: 5 },
  ARB:  { junior: 4, transition: 3, senior: 4 },
  BIO:  { junior: 3, transition: 2, senior: 3 },
  CHEM: { junior: 3, transition: 2, senior: 3 },
  PHY:  { junior: 3, transition: 2, senior: 3 },
  HIST: { junior: 2, transition: 2, senior: 3 },
  GEO:  { junior: 2, transition: 2, senior: 3 },
  BUS:  { junior: 0, transition: 2, senior: 3 },
  CS:   { junior: 2, transition: 2, senior: 2 },
  ART:  { junior: 1, transition: 1, senior: 0 },
  MUS:  { junior: 1, transition: 1, senior: 0 },
  PE:   { junior: 2, transition: 2, senior: 2 },
  RS:   { junior: 2, transition: 1, senior: 2 },
  HEC:  { junior: 1, transition: 1, senior: 0 },
};

export function getTier(yearGroupIndex: number): string {
  if (yearGroupIndex <= 2) return 'junior';
  if (yearGroupIndex === 3) return 'transition';
  return 'senior';
}

// Fee structures (AED) per year group
export const FEES_BY_YEAR: number[] = [24800, 26000, 27200, 24000, 29600, 31600];

// Room definitions
export const ROOM_DEFS: Array<{
  name: string;
  room_type: string;
  capacity: number;
  is_exclusive: boolean;
}> = [
  // 30 homeroom classrooms
  ...Array.from({ length: 6 }, (_, yi) =>
    Array.from({ length: 5 }, (_, si) => ({
      name: `Y${yi + 1}-R${si + 1}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: true,
    }))
  ).flat(),
  // Specialist rooms
  { name: 'Science Lab 1', room_type: 'lab', capacity: 25, is_exclusive: true },
  { name: 'Science Lab 2', room_type: 'lab', capacity: 25, is_exclusive: true },
  { name: 'Science Lab 3', room_type: 'lab', capacity: 25, is_exclusive: true },
  { name: 'Science Lab 4', room_type: 'lab', capacity: 25, is_exclusive: true },
  { name: 'Computer Lab 1', room_type: 'computer_lab', capacity: 30, is_exclusive: true },
  { name: 'Computer Lab 2', room_type: 'computer_lab', capacity: 30, is_exclusive: true },
  { name: 'Art Studio', room_type: 'art_room', capacity: 25, is_exclusive: true },
  { name: 'Music Room', room_type: 'music_room', capacity: 30, is_exclusive: true },
  { name: 'Library', room_type: 'library', capacity: 80, is_exclusive: false },
  { name: 'Gymnasium', room_type: 'gym', capacity: 120, is_exclusive: false },
  { name: 'Multi-Purpose Hall', room_type: 'auditorium', capacity: 200, is_exclusive: false },
  { name: 'Counselling Room', room_type: 'other', capacity: 6, is_exclusive: true },
];
