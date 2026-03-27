-- Phase G: Add unique constraint on behaviour_document_templates
-- Prevents duplicate template names per type/locale per tenant
CREATE UNIQUE INDEX "uq_behaviour_doc_templates_name"
  ON "behaviour_document_templates" ("tenant_id", "document_type", "locale", "name");
