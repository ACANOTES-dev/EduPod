-- Add deadline tracking columns to compliance_requests
ALTER TABLE compliance_requests ADD COLUMN deadline_at TIMESTAMPTZ;
ALTER TABLE compliance_requests ADD COLUMN extension_granted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE compliance_requests ADD COLUMN extension_reason TEXT;
ALTER TABLE compliance_requests ADD COLUMN extension_deadline_at TIMESTAMPTZ;
ALTER TABLE compliance_requests ADD COLUMN deadline_exceeded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE compliance_requests ADD COLUMN rectification_note TEXT;

-- Add new subject types to the enum
ALTER TYPE "ComplianceSubjectType" ADD VALUE IF NOT EXISTS 'applicant';
ALTER TYPE "ComplianceSubjectType" ADD VALUE IF NOT EXISTS 'staff';

-- Add portability request type
ALTER TYPE "ComplianceRequestType" ADD VALUE IF NOT EXISTS 'portability';
