-- Phase J: Security Incidents (platform-level, no RLS)

CREATE TABLE security_incidents (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity                      VARCHAR(20) NOT NULL,
  incident_type                 VARCHAR(50) NOT NULL,
  description                   TEXT NOT NULL,
  affected_tenants              UUID[] DEFAULT '{}',
  affected_data_subjects_count  INT,
  data_categories_affected      TEXT[] DEFAULT '{}',
  containment_actions           TEXT,
  reported_to_controllers_at    TIMESTAMPTZ,
  reported_to_dpc_at            TIMESTAMPTZ,
  dpc_reference_number          VARCHAR(50),
  root_cause                    TEXT,
  remediation                   TEXT,
  status                        VARCHAR(20) NOT NULL DEFAULT 'detected',
  created_by_user_id            UUID NOT NULL REFERENCES users(id),
  assigned_to_user_id           UUID REFERENCES users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS — security incidents are platform-level (may span tenants)

CREATE INDEX idx_security_incidents_status ON security_incidents(status);
CREATE INDEX idx_security_incidents_severity_detected ON security_incidents(severity, detected_at);

CREATE TABLE security_incident_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id         UUID NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
  event_type          VARCHAR(30) NOT NULL,
  description         TEXT NOT NULL,
  created_by_user_id  UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_incident_events_incident ON security_incident_events(incident_id, created_at);
