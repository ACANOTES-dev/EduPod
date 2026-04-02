import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

// ─── Payload types ────────────────────────────────────────────────────────────

interface ParentNotificationPayload {
  tenant_id: string;
  incident_id: string;
  student_ids: string[];
}

interface PolicyEvaluationPayload {
  tenant_id: string;
  incident_id: string;
  trigger: 'incident_created' | 'participant_added';
  triggered_at: string;
}

interface CheckAwardsPayload {
  tenant_id: string;
  incident_id: string;
  student_ids: string[];
  academic_year_id: string;
  academic_period_id: string | null;
}

interface SanctionParentNotificationPayload {
  tenant_id: string;
  sanction_id: string;
  student_id: string;
}

interface CreateExclusionCasePayload {
  tenant_id: string;
  sanction_id: string;
}

/**
 * Centralises all BullMQ queue dispatches for the behaviour domain.
 * Domain services call named methods here instead of injecting queues directly.
 */
@Injectable()
export class BehaviourSideEffectsService {
  private readonly logger = new Logger(BehaviourSideEffectsService.name);

  constructor(
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
  ) {}

  // ─── Incident side-effects ──────────────────────────────────────────────────

  async emitParentNotification(payload: ParentNotificationPayload): Promise<boolean> {
    try {
      await this.notificationsQueue.add('behaviour:parent-notification', payload);
      return true;
    } catch (err) {
      this.logger.warn(
        `[emitParentNotification] Failed to enqueue for incident ${payload.incident_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  async emitPolicyEvaluation(payload: PolicyEvaluationPayload): Promise<boolean> {
    try {
      await this.behaviourQueue.add('behaviour:evaluate-policy', payload);
      return true;
    } catch (err) {
      this.logger.warn(
        `[emitPolicyEvaluation] Failed to enqueue for incident ${payload.incident_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  async emitCheckAwards(payload: CheckAwardsPayload): Promise<boolean> {
    try {
      await this.behaviourQueue.add('behaviour:check-awards', payload);
      return true;
    } catch (err) {
      this.logger.warn(
        `[emitCheckAwards] Failed to enqueue for incident ${payload.incident_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  // ─── Sanction side-effects ──────────────────────────────────────────────────

  async emitSanctionParentNotification(payload: SanctionParentNotificationPayload): Promise<void> {
    try {
      await this.notificationsQueue.add('behaviour:sanction-parent-notification', payload);
    } catch (err) {
      this.logger.warn(
        `[emitSanctionParentNotification] Failed to enqueue for sanction ${payload.sanction_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async emitCreateExclusionCase(payload: CreateExclusionCasePayload): Promise<void> {
    try {
      await this.behaviourQueue.add('behaviour:create-exclusion-case', payload);
    } catch (err) {
      this.logger.warn(
        `[emitCreateExclusionCase] Failed to enqueue for sanction ${payload.sanction_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
