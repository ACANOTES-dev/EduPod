export interface SchoolAdminDashboardStats {
  total_students: number;
  active_students: number;
  applicants: number;
  total_staff: number;
  active_staff: number;
  total_classes: number;
  active_academic_year_name: string | null;
}

export interface RecentActivityItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_name: string;
  description: string;
  occurred_at: string;
}

export interface SchoolAdminDashboard {
  stats: SchoolAdminDashboardStats;
  recent_activity: RecentActivityItem[];
}

export interface ParentDashboardStudent {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  status: string;
  year_group_name: string | null;
  class_homeroom_name: string | null;
}

export interface ParentDashboardAnnouncement {
  id: string;
  title: string;
  summary: string;
  published_at: string;
}

export interface ParentDashboard {
  students: ParentDashboardStudent[];
  announcements: ParentDashboardAnnouncement[];
}
