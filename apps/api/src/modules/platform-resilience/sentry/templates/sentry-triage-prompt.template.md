<!-- prompt-template-anchor -->

# Sentry Triage Packet

You are preparing to triage a mirrored Sentry issue in the EduPod repository. Follow `docs/runbooks/agent-sentry-triage.md` end to end before making changes. This packet is informational only; it must not execute the runbook, call external systems, change code, deploy, resolve Sentry, or mark the issue fixed.

## Issue

- Local issue id: {{local_issue_id}}
- Sentry issue id: {{sentry_issue_id}}
- Project: {{sentry_project}}
- Environment: {{environment}}
- State: {{state}}
- Level: {{level}}
- Title: {{title}}
- Release: {{release}}
- First seen: {{first_seen_at}}
- Last seen: {{last_seen_at}}
- Permalink: {{permalink}}

## Correlations

- Deploy id: {{correlated_deploy_id}}
- Correlation ids: {{correlation_ids}}
- Runbooks: {{related_runbook_keys}}
- Topology: {{related_topology_keys}}
- Severity policy: {{severity_policy_match}}

## Evidence Summary

Stack summary:

```text
{{stack_summary}}
```

Tags:

```json
{{tags_json}}
```

Linked platform error log ids: {{linked_error_log_ids}}

## Required Alignment Tests

1. Confirm the local mirrored issue id and the Sentry issue id match the task.
2. Confirm no secret, raw payload, token, cookie, password, authorization header, or unredacted user data is present in this packet.
3. Confirm the runbook path is `docs/runbooks/agent-sentry-triage.md`.
4. Confirm the next step is to inspect and follow the runbook manually, not to execute this prompt automatically.
5. Confirm any fix remains inside the runbook guardrails, including failing-test-first and the audit-log entry.
