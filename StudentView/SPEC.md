# Student View — Design Specification

> **Status:** Pre-implementation spec — not yet in development
>
> **Important disclaimer:** This specification describes the intended student-facing experience for the platform. The underlying system is still being built and refined. Some modules, tables, endpoints, and data flows referenced in this document may not yet exist, may change shape, or may evolve before this spec is executed. **The timetable/scheduling module** is a known example — it is fully planned but not yet wired up. There will likely be others.
>
> This spec captures **what we want to achieve and why**. When the time comes to build (likely weeks from now), an implementation pass will reconcile this spec against the actual state of the system at that point.
>
> **Date:** 2026-04-11

---

## Table of Contents

1. [Vision](#1-vision)
2. [Architecture — Approach A: Gamification Engine First](#2-architecture--approach-a-gamification-engine-first)
3. [Gamification Engine (Backend Core)](#3-gamification-engine-backend-core)
4. [Photo Approval System](#4-photo-approval-system)
5. [Student Dashboard — The Home Experience](#5-student-dashboard--the-home-experience)
6. [Student Profile Page](#6-student-profile-page)
7. [Deeper Pages](#7-deeper-pages)
8. [Tenant Configuration Interface](#8-tenant-configuration-interface)
9. [Route & Permission Structure](#9-route--permission-structure)
10. [Mobile Considerations](#10-mobile-considerations)

---

## 1. Vision

The student view is not a stripped-down admin portal. It is a **gamified, engaging, student-first experience** that makes interacting with school data feel like a reward rather than a chore.

### Core Principles

- **Gamified, not gamey.** Real school data (grades, attendance, homework) presented through game mechanics (XP, levels, badges, quests). The data is serious; the experience is fun.
- **Short attention spans.** Students will not scroll through tables. Every piece of information must earn its place on screen. Cards, animations, progress indicators, countdowns — things that communicate instantly.
- **Active participation.** Students are not passive viewers. They submit homework (missions), check in on wellbeing, curate their profile, earn and share badges. The degree of participation is tenant-configurable.
- **Tenant-configurable everything.** One school may go full gamification with XP, levels, leaderboards, and badge sharing. Another may keep it minimal — clean cards, no game layer. The platform supports the full spectrum, controlled from a settings page.
- **No finance.** Financial information (fees, invoices, balances) is exclusively a parent concern. Students never see it.

### Design Language

- **Card-based layout.** No sidebars. The existing morph shell navigation is used. Content is organised into styled, interactive cards.
- **Interactive dashboards.** Not static data views. Cards respond to context, animate on interaction, and reward engagement.
- **Mobile-first.** Students will primarily access this on phones. Every card, every interaction, every animation must work at 375px width.

---

## 2. Architecture — Approach A: Gamification Engine First

The gamification engine is built as a standalone backend module first. It becomes the foundation that every student-facing feature builds on. This ensures:

- Every card has XP integration from the moment it appears
- Tenant configuration lives in one place
- Badge sharing, achievement broadcasts, and levelling all have a solid data foundation
- The engine is event-driven — existing modules emit domain events, the gamification module consumes them

### Build Order

1. Gamification engine (backend module: data model, XP service, badge service, level calculator, event listeners)
2. Tenant configuration interface (admin settings page)
3. Photo approval system (upload, approval queue, notification flow)
4. Student profile page (photo, bio, level, badge showcase)
5. Student dashboard shell (smart-ordering framework, card container)
6. Dashboard cards (one at a time: mission board, timetable, conduct/wellbeing, XP progress, wall of fame, announcements, inbox)
7. Deeper pages (missions, grades, attendance, conduct, badges, wellbeing history)
8. Achievement sharing (student-to-family, teacher-to-class, principal-to-school broadcasts)

---

## 3. Gamification Engine (Backend Core)

### Data Model

#### `student_xp_ledger` — Append-only XP event log

| Column        | Type        | Notes                                                                                                                                                                                                                     |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | UUID        | PK, `gen_random_uuid()`                                                                                                                                                                                                   |
| `tenant_id`   | UUID        | FK to tenants, NOT NULL                                                                                                                                                                                                   |
| `student_id`  | UUID        | FK to students, NOT NULL                                                                                                                                                                                                  |
| `action_type` | VARCHAR     | e.g., `homework_submitted`, `attendance_streak`, `wellbeing_checkin`                                                                                                                                                      |
| `xp_amount`   | INTEGER     | Points awarded (always positive)                                                                                                                                                                                          |
| `source_id`   | UUID        | Nullable — polymorphic reference to the record that triggered it. Not a strict FK — the source table is inferred from `action_type` (e.g., `homework_submitted` → homework record, `attendance_day` → attendance record). |
| `created_at`  | TIMESTAMPTZ | NOT NULL, DEFAULT now()                                                                                                                                                                                                   |

- **Append-only.** Never updated or deleted. Total XP = `SUM(xp_amount)` for a student.
- **RLS-enforced** with `tenant_id`.
- Index: `idx_student_xp_ledger_student_tenant` on `(student_id, tenant_id)`.

#### `student_levels` — Denormalised current state

| Column             | Type        | Notes                           |
| ------------------ | ----------- | ------------------------------- |
| `id`               | UUID        | PK                              |
| `tenant_id`        | UUID        | FK, NOT NULL                    |
| `student_id`       | UUID        | FK, NOT NULL, UNIQUE per tenant |
| `current_level`    | INTEGER     | NOT NULL, DEFAULT 1             |
| `total_xp`         | INTEGER     | NOT NULL, DEFAULT 0             |
| `xp_to_next_level` | INTEGER     | NOT NULL — remaining XP needed  |
| `created_at`       | TIMESTAMPTZ | NOT NULL, DEFAULT now()         |
| `updated_at`       | TIMESTAMPTZ | NOT NULL                        |

- Updated via BullMQ job whenever XP is awarded. Keeps dashboard reads fast.

#### `badge_definitions` — Badge catalogue

| Column            | Type        | Notes                                                            |
| ----------------- | ----------- | ---------------------------------------------------------------- |
| `id`              | UUID        | PK                                                               |
| `tenant_id`       | UUID        | Nullable — NULL for system badges, FK for school-custom          |
| `name`            | VARCHAR     | NOT NULL                                                         |
| `description`     | TEXT        | NOT NULL                                                         |
| `icon`            | VARCHAR     | Icon identifier from curated set                                 |
| `rarity`          | ENUM        | `common`, `rare`, `epic`, `legendary`                            |
| `criteria_type`   | ENUM        | `automatic`, `manual`                                            |
| `criteria_config` | JSONB       | For automatic: `{ "action": "homework_submitted", "count": 50 }` |
| `xp_reward`       | INTEGER     | Bonus XP for earning the badge                                   |
| `is_active`       | BOOLEAN     | DEFAULT true                                                     |
| `created_at`      | TIMESTAMPTZ |                                                                  |
| `updated_at`      | TIMESTAMPTZ |                                                                  |

- System badges have `tenant_id = NULL` and are seeded with migrations.
- **RLS note:** The `badge_definitions` RLS policy must use `tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid` in both USING and WITH CHECK clauses, so system badges (NULL tenant) are visible to all tenants while custom badges remain tenant-isolated.
- Custom badges are created by the school via the configuration interface.
- Rarity tiers: **common** (most students earn these), **rare** (requires sustained effort), **epic** (significant achievement), **legendary** (truly exceptional — designed to be celebrated school-wide).

#### `student_badges` — Earned badges

| Column       | Type        | Notes                                                     |
| ------------ | ----------- | --------------------------------------------------------- |
| `id`         | UUID        | PK                                                        |
| `tenant_id`  | UUID        | FK, NOT NULL                                              |
| `student_id` | UUID        | FK, NOT NULL                                              |
| `badge_id`   | UUID        | FK to badge_definitions, NOT NULL                         |
| `earned_at`  | TIMESTAMPTZ | NOT NULL                                                  |
| `awarded_by` | UUID        | Nullable — NULL if automatic, user_id if manually awarded |
| `is_pinned`  | BOOLEAN     | DEFAULT false — for profile showcase                      |

- Unique constraint on `(student_id, badge_id)` — a badge can only be earned once.

#### `badge_shares` — Sharing and broadcast records

| Column             | Type        | Notes                                        |
| ------------------ | ----------- | -------------------------------------------- |
| `id`               | UUID        | PK                                           |
| `tenant_id`        | UUID        | FK, NOT NULL                                 |
| `student_badge_id` | UUID        | FK to student_badges, NOT NULL               |
| `shared_by`        | UUID        | FK to users — student, teacher, or principal |
| `share_scope`      | ENUM        | `family`, `class`, `school`                  |
| `message`          | TEXT        | Optional — teacher/principal can add a note  |
| `created_at`       | TIMESTAMPTZ |                                              |

#### `gamification_config` — Per-tenant settings

| Column             | Type        | Notes                                                                                                                         |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`               | UUID        | PK                                                                                                                            |
| `tenant_id`        | UUID        | FK, UNIQUE, NOT NULL                                                                                                          |
| `is_enabled`       | BOOLEAN     | Master toggle, DEFAULT false                                                                                                  |
| `xp_rules`         | JSONB       | Maps action types to XP amounts                                                                                               |
| `level_thresholds` | JSONB       | Array of XP needed per level                                                                                                  |
| `enabled_features` | JSONB       | Feature flags: badges, levels, sharing, wall_of_fame, wellbeing_xp, mission_board, conduct_levels, student_profile_visibility |
| `conduct_tiers`    | JSONB       | Maps ranges to tier names                                                                                                     |
| `created_at`       | TIMESTAMPTZ |                                                                                                                               |
| `updated_at`       | TIMESTAMPTZ |                                                                                                                               |

Default `xp_rules`:

```json
{
  "homework_submitted": 10,
  "homework_on_time_bonus": 5,
  "attendance_day": 5,
  "perfect_attendance_week": 50,
  "wellbeing_checkin": 5,
  "badge_earned_common": 10,
  "badge_earned_rare": 25,
  "badge_earned_epic": 50,
  "badge_earned_legendary": 100
}
```

Default `level_thresholds`:

```json
[0, 100, 250, 500, 850, 1300, 1900, 2600, 3500, 4600, 6000]
```

Default `conduct_tiers`:

```json
{
  "bronze": { "min": 0, "max": 99 },
  "silver": { "min": 100, "max": 249 },
  "gold": { "min": 250, "max": 499 },
  "platinum": { "min": 500, "max": null }
}
```

**Important:** Conduct tiers are based on **behaviour points** (net merits minus demerits from the existing behaviour management module), NOT on XP. XP is the gamification currency; conduct level is a separate axis that reflects real behavioural standing. The conduct score recovers over time after incidents — the exact recovery formula is configurable per tenant. This separation ensures a student can't "game" their conduct level by doing homework.

### XP Award Flow

```
Existing module (homework, attendance, etc.)
  │
  ├─ emits domain event: gamification.xp.award
  │   { studentId, tenantId, action, sourceId }
  │
  ▼
Gamification Service (event listener)
  │
  ├─ checks tenant gamification_config.is_enabled
  ├─ looks up xp_rules for action_type
  ├─ inserts row into student_xp_ledger
  ├─ enqueues BullMQ job: gamification:recalculate-level
  │
  ▼
BullMQ Job: gamification:recalculate-level
  │
  ├─ SUM(xp_amount) for student → update student_levels
  ├─ check level_thresholds → level up if crossed
  ├─ check badge_definitions criteria → award badges if earned
  ├─ if badge earned → enqueue gamification:badge-earned notification
  ├─ if level up → enqueue gamification:level-up notification
  │
  ▼
Student sees results on next dashboard load
(or via real-time push if we add WebSocket later)
```

### System Badge Seed Set

These ship with every tenant:

| Badge          | Rarity    | Criteria                                                      |
| -------------- | --------- | ------------------------------------------------------------- |
| First Steps    | Common    | Earn first 10 XP                                              |
| Homework Hero  | Common    | Submit 10 assignments                                         |
| Streak Starter | Common    | 5-day attendance streak                                       |
| Mindful        | Common    | 7 wellbeing check-ins                                         |
| Consistent     | Rare      | Submit 25 assignments on time                                 |
| Iron Will      | Rare      | 20-day attendance streak                                      |
| Scholar        | Rare      | Achieve top grade in any subject                              |
| Team Player    | Rare      | 10 merit points from teachers                                 |
| Perfectionist  | Epic      | 100% homework completion in a term                            |
| Unbreakable    | Epic      | Full attendance for a term                                    |
| Gold Standard  | Epic      | Reach Gold conduct tier                                       |
| Rising Star    | Epic      | Improve grade average by 15%+ in a term                       |
| Legend         | Legendary | Reach Level 20                                                |
| Valedictorian  | Legendary | Highest GPA in year group (manual award)                      |
| Inspiration    | Legendary | Teacher-nominated for exceptional contribution (manual award) |

---

## 4. Photo Approval System

### Data Model

#### `student_photo_requests`

| Column             | Type        | Notes                             |
| ------------------ | ----------- | --------------------------------- |
| `id`               | UUID        | PK                                |
| `tenant_id`        | UUID        | FK, NOT NULL                      |
| `student_id`       | UUID        | FK, NOT NULL                      |
| `photo_url`        | VARCHAR     | Stored file path                  |
| `status`           | ENUM        | `pending`, `approved`, `rejected` |
| `rejection_reason` | TEXT        | Nullable — required when rejected |
| `submitted_at`     | TIMESTAMPTZ | NOT NULL                          |
| `reviewed_at`      | TIMESTAMPTZ | Nullable                          |
| `reviewed_by`      | UUID        | Nullable — FK to users            |

#### On the `students` table

- `photo_url` (VARCHAR, nullable) — only populated with the current approved photo. NULL until first approval.

### Approval Flow

```
Student uploads photo
  │
  ├─ File validation: JPEG/PNG/WebP, max 5MB
  ├─ Auto-crop to square
  ├─ Store in object storage
  ├─ Create student_photo_requests row (status: pending)
  ├─ Notification sent to users with students.manage permission
  │
  ▼
Admin reviews (approval queue or notification-driven)
  │
  ├─ APPROVE:
  │   ├─ Update students.photo_url to approved photo
  │   ├─ Mark request as approved, set reviewed_at/reviewed_by
  │   └─ Notify student: "Your photo is now live"
  │
  └─ REJECT:
      ├─ Mark request as rejected with reason
      └─ Notify student: "Your photo was not approved: {reason}"
```

### Safeguards

- **One pending request per student.** Cannot submit a new photo while one is pending review.
- **File type/size enforced** on upload (JPEG, PNG, WebP; max 5MB).
- **Square crop** applied automatically for consistent display.
- **Authenticated endpoint** for serving photos — no publicly accessible file URLs.
- **While pending:** student sees their current approved photo (or initials if first upload) with a subtle "Photo update pending review" indicator.
- **On rejection:** previous approved photo stays live. Student can re-upload.

### Admin Interface

- A photo approval queue accessible from the admin settings area.
- Each pending request shows: student photo, student name, year group, submitted timestamp.
- Two actions: Approve (one tap) or Reject (requires a reason).
- Could also function as a notification-driven flow — admin taps the notification and goes straight to review.

---

## 5. Student Dashboard — The Home Experience

### Smart Ordering

Cards reorder based on real-time context. The student always sees the most relevant information first. Smart ordering is **client-side logic** — the API returns all card data, and the frontend determines display order based on timestamps, due dates, and unread counts.

**Ordering rules:**

1. **Time-sensitive first.** Class starting within 30 minutes → timetable carousel moves to top. Homework due today → mission board rises.
2. **New events surface.** Achievement broadcast or unread announcement → that card bumps up.
3. **Stale cards sink.** Perfect attendance with nothing to show → attendance-related content drops. No announcements → card hides entirely.
4. **Fallback order** (when nothing is urgent): Timetable → Mission Board → Conduct & Wellbeing → XP/Level Progress → Wall of Fame → Announcements → Inbox Preview.

### Dashboard Cards

#### Card 1: Timetable Carousel

- Horizontal swipeable cards, one per class period.
- Current period card is enlarged and highlighted with a "NOW" pulse animation.
- Each card shows: subject name, teacher name, room number, period time.
- Tapping a card could later expand to show class materials or lesson notes.
- **Empty state** (until scheduling module is wired): friendly illustration with "Your timetable is being set up" message.

> **Note:** Depends on the scheduling module which is not yet wired. Design and build the card component with mock data; connect to real data when scheduling is live.

#### Card 2: Mission Board (Homework)

- Assignments styled as quests/missions.
- Each mission shows: subject icon, assignment title, due date countdown, XP reward.
- Colour-coded urgency: **overdue** (red glow), **due today** (amber), **upcoming** (default).
- Tapping a mission expands to show full details. Student can mark as complete or submit.
- Completion triggers: XP award animation (number flying up, progress bar advancing).
- **Card header:** completion ring showing progress ("7/10 missions complete this week").
- When gamification is disabled by tenant: missions display as a clean assignment list without XP indicators.

#### Card 3: Conduct Level & Wellbeing

Combined card with two distinct sections.

**Conduct section:**

- Current tier name and visual (e.g., "Gold" with a shield icon).
- Progress bar toward next tier.
- Trend arrow: improving / stable / declining.
- No raw incident or merit numbers. The emphasis is on growth and trajectory.
- Tapping opens the full conduct page.

**Wellbeing section:**

- "How are you feeling today?" with 5 emoji-style mood options.
- Tapping an option: awards XP (+5), logs the check-in, shows a brief affirming message ("Thanks for checking in!").
- If already checked in today: shows "Checked in today" with the chosen mood.
- Responses visible only to the student and pastoral staff.

#### Card 4: XP & Level Progress

- Current level number, prominently displayed.
- XP progress bar toward next level with exact numbers: "1,240 / 1,500 XP".
- Recent XP gains listed: "+10 XP — History homework submitted", "+5 XP — Daily check-in".
- **Level-up:** celebration animation (confetti, level badge reveal).

#### Card 5: Wall of Fame (Achievements)

- Recent achievement broadcasts from across the school.
- Examples: "Sara earned the Scholar badge!", "Mr. Ahmed recognised Ali for Outstanding Physics Project".
- Student's own recently earned badges shown at the top.
- Tapping a broadcast shows the full badge detail and who earned it.
- Teacher/principal broadcasts visually distinguished (school crest or teacher avatar).

#### Card 6: Announcements

- School-wide and class-specific announcements.
- Each entry: title, preview text, timestamp, source (school-wide or class name).
- Tapping expands to full content.
- Unread indicator dot on new announcements.
- Card hides entirely if there are no announcements.

#### Card 7: Inbox Preview

- Unread message count and most recent thread preview.
- Tapping navigates to the full inbox page.
- Compact — this is a pointer, not a full inbox view.

---

## 6. Student Profile Page

A single public profile view. What the student sees when they tap their avatar, and what others see when viewing their profile.

### Layout (top to bottom)

**Profile Header**

- Approved photo (or initials fallback) with a camera icon overlay for upload/change.
- If photo is pending approval: subtle "Pending review" indicator on the photo.
- Student full name.
- Year group.
- Student number.
- Short bio/status message — editable, max ~100 characters (e.g., "Aspiring physicist").
- Level badge prominently displayed: "Level 12" with compact XP bar beneath.

**Badge Showcase**

- Top 3 pinned badges selected by the student.
- Each badge shows: icon, name, rarity glow effect (common = subtle, legendary = animated border).
- "View all badges" link below to the full badge collection page.

**Stats Summary**

- Clean row of key metrics: attendance %, homework completion rate, conduct level tier, total XP.
- Headline numbers only — deep data lives on the dashboard and deeper pages.

**Edit Controls**

- Inline editing for bio/status message.
- Photo upload button (triggers the approval flow).
- Badge showcase selection (tap to swap which 3 are pinned).
- Link to full settings (theme, locale, MFA, sessions — the existing `/profile` page).

### Visibility Rules

| Viewer                     | What they see                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **The student themselves** | Everything + edit controls                                                                 |
| **Other students**         | Name, photo, year group, level, badge showcase, bio. No attendance/conduct/homework stats. |
| **Teachers / Admin**       | Everything the student sees (no edit controls)                                             |
| **Parents**                | Their own child's full profile                                                             |

- **Student-to-student profile visibility** is tenant-configurable. A school can disable it entirely.

---

## 7. Deeper Pages

Students tap through dashboard cards to reach these dedicated views.

### 7.1 Homework / Missions Page

- Full list of all assignments, filterable by: subject, status (active / completed / overdue).
- Each mission: subject icon, assignment title, description, due date, XP reward, submission status.
- Submit button for assignments that accept submissions (file upload, text entry — tenant-configurable submission types).
- Completed missions show XP earned with a checkmark.
- **Stats bar** at top: total missions completed, XP earned from homework, current streak.

### 7.2 Grades / Academic Page

- Subject-by-subject breakdown: current grade, term grades, trend arrow (improving / stable / declining).
- Tapping a subject expands to show individual assessments and scores.
- Overall GPA or average if the school uses that grading system.
- Class rank display is **tenant-configurable** — some schools disable ranking visibility.

### 7.3 Attendance Page

- Current attendance percentage displayed prominently.
- Calendar heat map: green (present), red (absent), amber (late) for the current term.
- Current streak counter: "14 days straight — keep it going!"
- Streak milestones tied to XP rewards and badge criteria.

### 7.4 Behaviour / Conduct Page

- Conduct level tier with visual progress toward next tier.
- Timeline of merit events (positive) — shown prominently as the default view.
- Incidents accessible but not front-and-centre — student taps "View details" to see incident records with context.
- Growth narrative: "Your conduct has improved 15% this term" — emphasis on trajectory.

### 7.5 Badges Collection Page

- Full grid of all earned badges, grouped by rarity.
- Unearned badges shown as locked silhouettes with criteria hints ("Submit 50 assignments to unlock").
- Tap a badge: full detail card with name, description, when earned, rarity, XP bonus.
- **Share button** on each badge — share to family.
- **Pinning controls:** select which 3 appear on the profile showcase.

### 7.6 Wellbeing History (Tenant-Toggleable)

- Personal mood timeline: the student's own check-in history as a visual chart over time.
- **Private** to the student and pastoral staff only.
- Gentle pattern surfacing: "You've been feeling great this week!"
- Resources link if the school configures pastoral support contacts.

---

## 8. Tenant Configuration Interface

Admin-facing settings page for schools to control the student experience.

### Settings Sections

#### Gamification Master Toggle

- On/off for the entire gamification layer.
- **When off:** students get the dashboard with real data (grades, attendance, homework) displayed as clean cards. No XP, no levels, no badges, no mission framing.
- **When on:** full gamification experience active, with individual feature toggles below.

#### Feature Toggles (independently switchable)

| Feature                    | Default | Description                                              |
| -------------------------- | ------- | -------------------------------------------------------- |
| XP & Levels                | On      | XP awards and level progression                          |
| Badges (system + custom)   | On      | Badge earning and display                                |
| Wall of Fame               | On      | Achievement broadcasts on dashboard                      |
| Badge sharing              | On      | Student-to-family, teacher-to-class, principal-to-school |
| Wellbeing check-in         | On      | Daily mood check-in with optional XP                     |
| Wellbeing XP reward        | On      | XP for checking in (disable to remove incentive)         |
| Mission board framing      | On      | Homework shown as quests. Off = standard list            |
| Conduct level system       | On      | Growth-oriented conduct display. Off = card hidden       |
| Student profile visibility | On      | Whether students can view each other's profiles          |
| Class rank visibility      | Off     | Whether students see their rank in class/year            |

#### XP Rules Table

Editable table for schools to configure XP values per action:

| Action                   | Default XP | Enabled |
| ------------------------ | ---------- | ------- |
| Homework submitted       | 10         | Yes     |
| Homework on-time bonus   | 5          | Yes     |
| Attendance day           | 5          | Yes     |
| Perfect attendance week  | 50         | Yes     |
| Wellbeing check-in       | 5          | Yes     |
| Badge earned (common)    | 10         | Yes     |
| Badge earned (rare)      | 25         | Yes     |
| Badge earned (epic)      | 50         | Yes     |
| Badge earned (legendary) | 100        | Yes     |

Schools can adjust values, disable specific actions, or request custom action types.

#### Level Thresholds

Editable list defining XP needed for each level. Pre-populated with a default progression curve. Schools can flatten (easier) or steepen (harder) the curve.

#### Conduct Tier Configuration

Configurable tier names and thresholds:

- Default names: Bronze → Silver → Gold → Platinum
- Schools can rename (e.g., "Explorer → Scholar → Master → Legend")
- Threshold values adjustable per tier.

#### Custom Badge Builder

- Create badges: name, description, icon (from curated icon set), rarity tier.
- Criteria: **automatic** (rule-based, e.g., "submit 20 homework assignments") or **manual** (teacher awards it directly).
- Preview of how the badge looks before saving.

#### Photo Approval Queue

- Accessible from settings or as notification-driven flow.
- Pending requests: student photo, name, year group, timestamp.
- Actions: Approve (one tap) or Reject (requires reason text).

### Permission Mapping

| Setting Area              | Accessible By                                             |
| ------------------------- | --------------------------------------------------------- |
| All gamification settings | School owner, principal, vice-principal                   |
| Photo approval queue      | School owner, principal, vice-principal, admin            |
| Badge management (custom) | School owner, principal, vice-principal, admin            |
| Manual badge awarding     | Teachers (to their students), admin, principal            |
| Achievement broadcasting  | Teachers (to class), principal/vice-principal (to school) |

---

## 9. Route & Permission Structure

### New Student Routes

| Route                 | Description                                                            | Access            |
| --------------------- | ---------------------------------------------------------------------- | ----------------- |
| `/dashboard`          | Student dashboard home (existing route, student role gets custom view) | All authenticated |
| `/profile`            | Student profile page (existing route, enhanced for students)           | All authenticated |
| `/student/missions`   | Full homework/missions page                                            | Student           |
| `/student/grades`     | Academic grades page                                                   | Student           |
| `/student/attendance` | Attendance history                                                     | Student           |
| `/student/conduct`    | Behaviour/conduct page                                                 | Student           |
| `/student/badges`     | Badge collection page                                                  | Student           |
| `/student/wellbeing`  | Wellbeing history (if tenant-enabled)                                  | Student           |

### New Permissions

| Permission                      | Description                                               |
| ------------------------------- | --------------------------------------------------------- |
| `gamification.configure`        | Manage gamification settings (XP rules, levels, features) |
| `gamification.badges.manage`    | Create/edit/deactivate custom badges                      |
| `gamification.badges.award`     | Manually award badges to students                         |
| `gamification.badges.broadcast` | Share student achievements to class or school             |
| `students.photos.review`        | Review and approve/reject student photo uploads           |

### Student Role Hub Visibility

Students see a simplified morph shell:

- **Home** — the gamified dashboard
- **Learning** — missions, grades
- **Inbox** — messages

No access to: People, Operations, Finance, Reports, Settings.

---

## 10. Mobile Considerations

Students will primarily use this on phones. Every design decision must account for 375px minimum width.

### Dashboard

- Cards stack vertically in smart-ordered priority.
- Timetable carousel: horizontal swipe works natively on touch.
- Mission board: vertical list, each mission is a tappable card.
- All touch targets minimum 44x44px.

### Cards

- Full-width on mobile, no side-by-side layouts below `md` breakpoint.
- Progress bars and rings scale fluidly.
- XP animations lightweight — no heavy GPU usage on low-end devices.

### Profile

- Photo and header stack vertically.
- Badge showcase: 3 badges in a horizontal row, responsive sizing.
- Edit controls: full-width inputs, 16px minimum font (prevent iOS zoom).

### Navigation

- Morph shell with hamburger on mobile.
- Sub-strip for student routes: horizontally scrollable if needed.
- No bottom tab bar.

### RTL

- All layouts use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`).
- Badge showcase and timetable carousel respect reading direction.
- Wellbeing emoji row and progress bars are direction-neutral.
