-- CreateEnum
CREATE TYPE "BehaviourChangeType" AS ENUM (
  'created',
  'status_changed',
  'updated',
  'participant_added',
  'participant_removed',
  'sanction_created',
  'follow_up_recorded',
  'escalated',
  'withdrawn',
  'attachment_added',
  'policy_action_applied',
  'appeal_outcome',
  'parent_description_set',
  'admin_approved',
  'amendment_created',
  'cancelled',
  'completed',
  'correction_sent',
  'decided',
  'decision_recorded',
  'document_finalised',
  'document_generated',
  'document_printed',
  'document_sent',
  'expired',
  'legal_hold_released',
  'legal_hold_set',
  'rejected',
  'revoked',
  'anonymised'
);

-- AlterTable: change column type from varchar to enum
ALTER TABLE "behaviour_entity_history"
  ALTER COLUMN "change_type" TYPE "BehaviourChangeType"
  USING "change_type"::"BehaviourChangeType";

-- AlterTable: add cooldown_hours to policy rules
ALTER TABLE "behaviour_policy_rules" ADD COLUMN IF NOT EXISTS "cooldown_hours" INTEGER DEFAULT 24;

-- CreateFunction: prevent deletion of last student participant
CREATE OR REPLACE FUNCTION check_student_participant_minimum()
RETURNS TRIGGER AS $$
DECLARE
  remaining_count INT;
BEGIN
  IF OLD.participant_type = 'student' THEN
    SELECT COUNT(*) INTO remaining_count
    FROM behaviour_incident_participants
    WHERE incident_id = OLD.incident_id
      AND participant_type = 'student'
      AND id != OLD.id;

    IF remaining_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last student participant from incident %', OLD.incident_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
DROP TRIGGER IF EXISTS trg_check_student_participant_minimum ON behaviour_incident_participants;
CREATE TRIGGER trg_check_student_participant_minimum
  BEFORE DELETE ON behaviour_incident_participants
  FOR EACH ROW
  EXECUTE FUNCTION check_student_participant_minimum();
