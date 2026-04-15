import { z } from 'zod';

export const createClassSchema = z
  .object({
    academic_year_id: z.string().uuid(),
    year_group_id: z.string().uuid(),
    /**
     * SCHED-022: additional year-group links. When set, the class is also
     * surfaced under these year groups in admin UIs and reports. Scheduling
     * semantics are unchanged — the primary ``year_group_id`` above drives
     * period-grid selection, and cross-year student conflicts route via
     * ``class_enrolments`` → solver ``student_overlaps`` regardless.
     * Must not repeat the primary ``year_group_id``.
     */
    additional_year_group_ids: z.array(z.string().uuid()).optional(),
    homeroom_teacher_staff_id: z.string().uuid().optional(),
    name: z.string().min(1).max(255),
    max_capacity: z.number().int().min(1).max(200),
    class_type: z.enum(['fixed', 'floating']),
    homeroom_id: z.string().uuid().optional(),
    status: z.enum(['active', 'inactive']),
  })
  .refine((data) => data.class_type !== 'fixed' || !!data.homeroom_id, {
    message: 'Assigned Classroom is required for fixed classes',
    path: ['homeroom_id'],
  })
  .refine((data) => !data.additional_year_group_ids?.includes(data.year_group_id), {
    message: 'additional_year_group_ids must not include the primary year_group_id',
    path: ['additional_year_group_ids'],
  });

export type CreateClassDto = z.infer<typeof createClassSchema>;

export const updateClassSchema = z.object({
  year_group_id: z.string().uuid().nullable().optional(),
  /**
   * SCHED-022: replace the set of additional year-group links. Omit to
   * leave existing links untouched; send an empty array to clear them.
   * Must not include the current primary ``year_group_id``.
   */
  additional_year_group_ids: z.array(z.string().uuid()).optional(),
  subject_id: z.string().uuid().nullable().optional(),
  homeroom_teacher_staff_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  max_capacity: z.number().int().min(1).max(200).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export type UpdateClassDto = z.infer<typeof updateClassSchema>;

export const updateClassStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'archived']),
});

export type UpdateClassStatusDto = z.infer<typeof updateClassStatusSchema>;

export const assignClassStaffSchema = z.object({
  staff_profile_id: z.string().uuid(),
  assignment_role: z.enum(['teacher', 'assistant', 'homeroom', 'substitute']),
});

export type AssignClassStaffDto = z.infer<typeof assignClassStaffSchema>;

export const createEnrolmentSchema = z.object({
  student_id: z.string().uuid(),
  start_date: z.string().min(1, 'start_date is required'),
});

export type CreateEnrolmentDto = z.infer<typeof createEnrolmentSchema>;

export const bulkEnrolSchema = z.object({
  student_ids: z.array(z.string().uuid()).min(1, 'At least one student_id is required'),
  start_date: z.string().min(1, 'start_date is required'),
});

export type BulkEnrolDto = z.infer<typeof bulkEnrolSchema>;

export const updateEnrolmentStatusSchema = z.object({
  status: z.enum(['active', 'dropped', 'completed']),
  end_date: z.string().optional(),
});

export type UpdateEnrolmentStatusDto = z.infer<typeof updateEnrolmentStatusSchema>;

export const bulkClassAssignmentSchema = z.object({
  assignments: z
    .array(
      z.object({
        student_id: z.string().uuid(),
        class_id: z.string().uuid(),
      }),
    )
    .min(1, 'At least one assignment is required'),
  start_date: z.string().min(1, 'start_date is required'),
});

export type BulkClassAssignmentDto = z.infer<typeof bulkClassAssignmentSchema>;
