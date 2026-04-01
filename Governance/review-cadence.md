# Weekly Health Review Cadence

> Last updated: 2026-04-01
> Cadence owner: Ram

Hold one dedicated health review every week until the system exits the high-risk band.

## Default rhythm

- Run the review in the first working block of each week.
- If a release, incident, or major audit change lands mid-week, run an extra review instead of waiting.

## Required agenda

1. Review open `NOW` and `NEXT` backlog items.
2. Confirm which risks moved, stalled, or need re-verification.
3. Check the latest scorecard evidence:
   - baseline gates
   - KPI trends
   - new or retired risks
4. Confirm roadmap work did not crowd out reserved health capacity.
5. Decide the next week's health priorities and blocked items.

## Required outputs

- backlog status updates in [recovery-backlog.md](./recovery-backlog.md)
- a short scorecard or checkpoint update in this repo
- explicit note of any displaced health work and its recovery plan

## Exit condition

The weekly review can step down only when both are true:

- there are no open `NOW` or `NEXT` health-backlog items
- the final independent re-audit confirms the target health band
