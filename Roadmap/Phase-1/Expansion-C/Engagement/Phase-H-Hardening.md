# Phase H — Hardening

**Wave**: 5
**Deploy Order**: d8
**Depends On**: G

## Scope

Analytics dashboard, calendar integration, annual consent renewal automation, and performance hardening. This phase adds the polish and long-term operational features that make the engagement module production-grade: admins get aggregate visibility, events appear in the school calendar, annual consents auto-renew at year rollover, and all endpoints meet performance targets.

## Deliverables

### API Endpoints

- Add to `apps/api/src/modules/engagement/events.controller.ts`:
  - `GET    /v1/engagement/analytics/overview` — Aggregate stats: total events (by type), total forms distributed, total submissions, average response time, outstanding action items count.
  - `GET    /v1/engagement/analytics/completion-rates` — Per-event and per-form completion rates, filterable by academic year, event type, date range. Response includes: event/form name, total distributed, submitted, expired, completion percentage.
  - `GET    /v1/engagement/calendar-events` — Returns engagement events formatted for the school calendar component. Fields: id, title, start_date, end_date, event_type, status, colour code. Filterable by date range and event type.

### Worker

- `apps/worker/src/engagement/engagement-annual-renewal.processor.ts` — Processes `engagement:annual-consent-renewal`. Triggered at academic year rollover (via existing year-end cron or manually). Iterates all tenants. For each tenant: find all `annual` consent records with `status = active` and `expires_at` <= year end date. Set `status = expired`. For each expired record's form template, create new `pending` submissions for the same students in the new academic year. Dispatch renewal notification to parents.

### Cron Registration

- Update `CronSchedulerService` in worker — register `engagement:annual-consent-renewal`. This should be triggered by the academic year rollover event (either as a listener on the existing year-end process, or as a cron that checks for recently-closed academic years daily).

### Frontend

- `apps/web/src/app/[locale]/(school)/engagement/analytics/page.tsx` — Analytics dashboard: summary cards (total events, total forms, average completion rate), completion rate chart (bar chart by event type), response time trend (line chart), outstanding items table. Date range picker. Academic year filter.

### Calendar Integration

- Modify the existing school calendar component/data source to include engagement events. The calendar already renders timetable events — add a new data source that fetches from `GET /v1/engagement/calendar-events` and renders engagement events with distinct styling (different colour per event type).
- Location of calendar component: investigate existing calendar implementation in the scheduling module and add the integration point there.

### i18n

- Add analytics and calendar-related keys to `apps/web/messages/en.json` and `apps/web/messages/ar.json`.

### Performance Targets

Verify all engagement endpoints meet these benchmarks:

| Endpoint category                               | p95 target | Notes                                            |
| ----------------------------------------------- | ---------- | ------------------------------------------------ |
| List endpoints (events, templates, submissions) | < 200ms    | With pagination, 500 concurrent users            |
| Dashboard / analytics                           | < 500ms    | Aggregation queries, may need materialised views |
| Form submission (parent)                        | < 300ms    | Including signature validation                   |
| Conference booking                              | < 200ms    | Including conflict check with row lock           |
| Trip pack generation                            | < 10s      | PDF rendering is inherently slow — acceptable    |

If any endpoint exceeds targets:

- Add database indexes (check query plans with `EXPLAIN ANALYZE`)
- Consider materialised views for dashboard/analytics aggregations
- Add Redis caching for frequently-read, slowly-changing data (event dashboard stats)

### Module Update

- Update `apps/api/src/modules/engagement/engagement.module.ts` — register analytics controller/service if split out, or ensure analytics routes are handled.

## Out of Scope

- Core forms, events, trips, conferences functionality (Phases B–G — all already built)
- New feature additions beyond what the spec defines

## Dependencies

- **Phase G**: All frontend pages and API endpoints must be deployed and functional. Analytics queries aggregate data from all engagement tables. Calendar integration renders events that exist from the full feature set.
- Transitively depends on all prior phases (A through G).

## Implementation Notes

- **Analytics queries**: Completion rate queries should use aggregate functions (`COUNT`, `GROUP BY`) rather than loading all records into memory. For large datasets (1000+ events), consider creating a materialised view that refreshes on a schedule (e.g., every 15 minutes via a lightweight cron job).
- **Calendar integration**: The existing school calendar likely uses a specific data format. Investigate the calendar component's data interface before implementing `GET /calendar-events`. The response should match the calendar's expected event shape.
- **Annual consent renewal**: This is a high-volume operation at year rollover (potentially thousands of submissions across all tenants). Process per-tenant with `concurrency: 1` to avoid overwhelming the database. Use BullMQ's built-in rate limiting. Log progress (`Processing tenant X: renewed Y consents`).
- **Performance testing**: After deployment, run load tests against the key endpoints using representative data volumes (500 events, 1000 students, 5000 submissions). Use `autocannon` or similar tool. Document results.
- **Response time calculation**: "Average response time" in analytics = mean(`submitted_at - created_at`) for submitted forms. This measures how quickly parents respond after receiving a form. Useful metric for school administrators.
- **Calendar event colours**: Suggested colour coding: trips = blue, conferences = purple, policy signoffs = amber, sports events = green, cultural events = orange. Configurable per tenant if needed (but start with sensible defaults).
