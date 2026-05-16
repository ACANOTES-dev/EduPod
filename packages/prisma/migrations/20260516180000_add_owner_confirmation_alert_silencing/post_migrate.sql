-- Keep the new solo-owner confirmation flag populated on fresh databases
-- where the immutable 1.5A post-migrate seed still writes the legacy column.
UPDATE platform_permissions
SET requires_owner_confirmation = requires_two_person
WHERE requires_owner_confirmation IS DISTINCT FROM requires_two_person;
