import { z } from 'zod';

export const SEN_CATEGORY_VALUES = [
  'learning',
  'emotional_behavioural',
  'physical',
  'sensory',
  'asd',
  'speech_language',
  'multiple',
  'other',
] as const;
export type SenCategory = (typeof SEN_CATEGORY_VALUES)[number];
export const senCategorySchema = z.enum(SEN_CATEGORY_VALUES);

export const SEN_SUPPORT_LEVEL_VALUES = ['school_support', 'school_support_plus'] as const;
export type SenSupportLevel = (typeof SEN_SUPPORT_LEVEL_VALUES)[number];
export const senSupportLevelSchema = z.enum(SEN_SUPPORT_LEVEL_VALUES);

export const SUPPORT_PLAN_STATUS_VALUES = [
  'draft',
  'active',
  'under_review',
  'closed',
  'archived',
] as const;
export type SupportPlanStatus = (typeof SUPPORT_PLAN_STATUS_VALUES)[number];
export const supportPlanStatusSchema = z.enum(SUPPORT_PLAN_STATUS_VALUES);

export const SEN_GOAL_STATUS_VALUES = [
  'not_started',
  'in_progress',
  'partially_achieved',
  'achieved',
  'discontinued',
] as const;
export type SenGoalStatus = (typeof SEN_GOAL_STATUS_VALUES)[number];
export const senGoalStatusSchema = z.enum(SEN_GOAL_STATUS_VALUES);

export const SEN_PROFESSIONAL_TYPE_VALUES = [
  'educational_psychologist',
  'speech_therapist',
  'occupational_therapist',
  'camhs',
  'physiotherapist',
  'seno',
  'neps',
  'other',
] as const;
export type SenProfessionalType = (typeof SEN_PROFESSIONAL_TYPE_VALUES)[number];
export const senProfessionalTypeSchema = z.enum(SEN_PROFESSIONAL_TYPE_VALUES);

export const SEN_REFERRAL_STATUS_VALUES = [
  'pending',
  'scheduled',
  'completed',
  'report_received',
] as const;
export type SenReferralStatus = (typeof SEN_REFERRAL_STATUS_VALUES)[number];
export const senReferralStatusSchema = z.enum(SEN_REFERRAL_STATUS_VALUES);

export const ACCOMMODATION_TYPE_VALUES = ['exam', 'classroom', 'assistive_technology'] as const;
export type AccommodationType = (typeof ACCOMMODATION_TYPE_VALUES)[number];
export const accommodationTypeSchema = z.enum(ACCOMMODATION_TYPE_VALUES);

export const SNA_ASSIGNMENT_STATUS_VALUES = ['active', 'ended'] as const;
export type SnaAssignmentStatus = (typeof SNA_ASSIGNMENT_STATUS_VALUES)[number];
export const snaAssignmentStatusSchema = z.enum(SNA_ASSIGNMENT_STATUS_VALUES);

export const SEN_RESOURCE_SOURCE_VALUES = ['seno', 'school'] as const;
export type SenResourceSource = (typeof SEN_RESOURCE_SOURCE_VALUES)[number];
export const senResourceSourceSchema = z.enum(SEN_RESOURCE_SOURCE_VALUES);

export const SEN_TRANSITION_NOTE_TYPE_VALUES = [
  'class_to_class',
  'year_to_year',
  'school_to_school',
  'general',
] as const;
export type SenTransitionNoteType = (typeof SEN_TRANSITION_NOTE_TYPE_VALUES)[number];
export const senTransitionNoteTypeSchema = z.enum(SEN_TRANSITION_NOTE_TYPE_VALUES);
