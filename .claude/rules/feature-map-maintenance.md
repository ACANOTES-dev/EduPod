# Feature Map Maintenance — Ask Before Updating

The `docs/architecture/feature-map.md` is the single source of truth for what the product does and where the code lives. It must stay accurate — but it must not thrash during iterative work.

## Rule: Never Auto-Update the Feature Map

When you make a change that affects the feature map (new endpoint, new page, removed feature, renamed module, changed permissions, etc.), do NOT update the feature map immediately.

Instead, at the end of the task:

1. **Tell the user** what feature map changes would be needed (e.g., "This adds 2 new endpoints to the finance module and a new frontend page — the feature map should be updated.")
2. **Ask**: "Is this change final, or are you still iterating? Should I update the feature map now?"
3. **Wait for confirmation.** Only update the feature map when the user says they're done iterating.

## What Triggers a Feature Map Update

- New API endpoint added or removed
- New frontend page added or removed
- New module created
- Module renamed or reorganised
- Feature significantly changed in scope
- New worker job added
- Permission changes

## What Does NOT Trigger an Update

- Bug fixes within existing features
- Styling or UI tweaks
- Test additions
- Code refactoring that doesn't change the public API
- Configuration changes

## When Updating

- Update ONLY the affected section(s), not the entire file
- Keep the same format and structure as the rest of the document
- Update the "Last verified" date at the top
- Update the Quick Reference table counts if endpoints/pages changed
