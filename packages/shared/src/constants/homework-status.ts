import type { HomeworkStatus } from '../types/homework';

export const VALID_HOMEWORK_TRANSITIONS: Record<HomeworkStatus, HomeworkStatus[]> = {
  draft: ['published', 'archived'],
  published: ['archived'],
  archived: [],
};
