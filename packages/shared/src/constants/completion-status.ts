import type { CompletionStatus } from '../types/homework';

export const COMPLETION_STATUS_LABELS: Record<CompletionStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};
