# Chunk 09 — Role-Specific Home Variants

## What This Does

Builds differentiated home page experiences for Teacher, Parent, Accounting, and Front Office roles. Chunk 06 built the Principal/Admin variant. This chunk adds the other four.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Section 4 (Role-Specific Home Variants table)
- `apps/web/src/app/[locale]/(school)/dashboard/` — the home page from chunk 06
- `apps/web/src/lib/route-roles.ts` — role definitions

## Role Variant Specs

### Teacher Home

| Section        | Content                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| Priority Feed  | My pending attendance sessions, grading queue items, upcoming classes today |
| Snapshot Stats | My Classes (count), Pending Grades (count), Today's Schedule (list)         |
| Quick Actions  | Take Attendance, Enter Grades, View Schedule                                |

The teacher home is focused on "what do I need to do right now." Less administrative, more task-oriented.

### Parent Home

| Section        | Content                                                          |
| -------------- | ---------------------------------------------------------------- |
| Priority Feed  | Invoices due, forms/consent to complete, school announcements    |
| Snapshot Stats | One card per child (name, year group, attendance %), Balance Due |
| Quick Actions  | Pay Invoice, View Grades, Contact School                         |

The parent home is warm and child-centric. Each child gets a mini card in the snapshot section showing their photo (or avatar), name, year group, and a quick attendance indicator.

### Accounting Home

| Section        | Content                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| Priority Feed  | Overdue invoices, pending payments, reconciliation alerts                       |
| Snapshot Stats | Outstanding balance, Collected this month, Overdue amount, Unallocated payments |
| Quick Actions  | New Invoice, Record Payment, Run Report                                         |

Financial focus — all numbers, all the time.

### Front Office Home

| Section        | Content                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| Priority Feed  | Pending admissions, visitor check-ins, incoming communications              |
| Snapshot Stats | Active Students, Pending Applications, Today's Attendance %, Open Inquiries |
| Quick Actions  | Register Family, Check Attendance, New Communication, Find Student          |

Operational focus — people and processes.

## Implementation

### New Components

In `apps/web/src/app/[locale]/(school)/dashboard/_components/`:

1. `teacher-home.tsx` — Teacher-specific layout
2. `parent-home.tsx` — Parent-specific layout with child cards
3. `accounting-home.tsx` — Finance-focused layout
4. `front-office-home.tsx` — Operations-focused layout

Each variant reuses the shared components from chunk 06 (GreetingRow, PriorityFeed, ActivityFeed, SchoolSnapshot, QuickActions) but with different configurations:

```typescript
// Example: TeacherHome passes different props
<PriorityFeed
  sources={['pending_attendance', 'grading_queue', 'upcoming_classes']}
/>
<SchoolSnapshot
  stats={[
    { label: 'My Classes', endpoint: '/v1/classes?mine=true', icon: 'book' },
    { label: 'Pending Grades', endpoint: '/v1/gradebook/pending-count', icon: 'edit' },
  ]}
/>
<QuickActions
  actions={[
    { label: 'Take Attendance', href: '/attendance', icon: 'check-square' },
    { label: 'Enter Grades', href: '/gradebook', icon: 'edit' },
    { label: 'View Schedule', href: '/scheduling', icon: 'calendar' },
  ]}
/>
```

### Dashboard Page Router

Modify `apps/web/src/app/[locale]/(school)/dashboard/page.tsx`:

```typescript
// Determine user role and render appropriate variant
const role = user.roleKey;

if (role === 'parent') return <ParentHome />;
if (role === 'teacher') return <TeacherHome />;
if (['school_accountant'].includes(role)) return <AccountingHome />;
if (['front_office'].includes(role)) return <FrontOfficeHome />;
return <AdminHome />; // Default: Principal/Admin/Owner
```

Use the existing auth context to determine the user's role. The role key comes from the JWT/session.

### Parent Child Cards

The parent home variant needs a "child card" component showing each enrolled student:

- Student photo/avatar (40px circle)
- Student name (body-medium)
- Year group (caption, `var(--color-text-tertiary)`)
- Attendance indicator (small emerald/amber/red dot + percentage)
- Clickable → navigates to student detail

## Verification

1. Log in as Principal → Admin home (from chunk 06).
2. Log in as Teacher → Teacher home with classes/grades focus.
3. Log in as Parent → Parent home with child cards.
4. Log in as Accountant → Finance-focused home.
5. Each variant has appropriate priority feed items.
6. Each variant has relevant quick actions.
7. Snapshot stats change per role.
8. Mobile: all variants work at 375px width.
9. RTL: all variants mirror correctly.

## What NOT to Change

- Do not modify the morph bar or sub-strip based on role — that's already handled by hub filtering in chunk 03.
- Do not create new API endpoints — use existing ones. If data isn't available for a stat, show a placeholder or omit the stat.
