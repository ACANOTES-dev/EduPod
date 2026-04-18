-- Wave 3 — RLS policies for homework submissions + Adam Moore backfill.
--
-- Idempotent. Safe to re-run. DROP POLICY IF EXISTS + CREATE POLICY matches
-- the pattern established across the codebase.

-- ─── Homework Submissions ───────────────────────────────────────────────────

ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_submissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homework_submissions_tenant_isolation ON homework_submissions;
CREATE POLICY homework_submissions_tenant_isolation ON homework_submissions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Homework Submission Attachments ────────────────────────────────────────

ALTER TABLE homework_submission_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_submission_attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homework_submission_attachments_tenant_isolation ON homework_submission_attachments;
CREATE POLICY homework_submission_attachments_tenant_isolation ON homework_submission_attachments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Adam Moore backfill ────────────────────────────────────────────────────
--
-- Idempotent: only updates rows where user_id is NULL and a matching user
-- exists. Safe to re-run after additional student users are seeded; this
-- statement will only touch the ones that haven't been linked yet.
--
-- Match on email.local-part = {first_name}.{last_name} (lowercased) against
-- an active student membership within the same tenant. Deliberately does
-- NOT do pure first+last name matching — that's exactly the bug this
-- migration is fixing. Email pattern matching is acceptable here because
-- (a) it's a one-shot seed, not a runtime resolver, and (b) any collision
-- would silently update zero rows (no harm), not the wrong row.

UPDATE students s
   SET user_id = u.id
  FROM users u
  JOIN tenant_memberships tm ON tm.user_id = u.id
  JOIN membership_roles mr ON mr.membership_id = tm.id
  JOIN roles r ON r.id = mr.role_id
 WHERE s.user_id IS NULL
   AND r.role_key = 'student'
   AND tm.tenant_id = s.tenant_id
   AND tm.membership_status = 'active'
   AND split_part(u.email, '@', 1) = lower(s.first_name) || '.' || lower(s.last_name)
   AND NOT EXISTS (
     -- Respect the partial unique index: another row in the same tenant
     -- may already claim this user_id. Skip rather than conflict.
     SELECT 1 FROM students s2
      WHERE s2.tenant_id = s.tenant_id
        AND s2.user_id = u.id
        AND s2.id <> s.id
   );
