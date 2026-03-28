---
name: Native Mobile App
description: SHOULD-HAVE — Teachers expect phone-based attendance and behaviour logging. Competitors have apps (Compass 3.7/5, VSware 1.7/5). Opportunity to win on quality.
type: project
---

**Priority:** Should-have. Not a hard blocker but expected by teachers. Massive opportunity given competitors' poor app quality.

**What it is:**
Native iOS and Android apps (or an excellent PWA) for teachers, parents, and students to access core daily-use features from their phones.

**Teacher app must support:**
- Attendance marking (the #1 daily use case — must be fast, 2-3 taps per class)
- Behaviour incident logging (quick-log during/between classes)
- Timetable view (today's schedule at a glance)
- Class lists with student photos
- Grade entry for assessments
- Push notifications (cover requests, schedule changes, announcements)
- Substitution board

**Parent app must support:**
- View child's attendance, grades, behaviour
- View timetable
- Make payments
- Read announcements
- View and acknowledge report cards
- Push notifications

**Competitor status:**
- Compass: native iOS/Android, 1M+ downloads, but rated 3.7/5 on Google Play. iOS complaints about broken keyboards, random logouts, re-entering payment details.
- VSware: native iOS/Android, rated 1.7/5 on iOS App Store. 227 of 288 ratings are 1-star. "Obviously no one at VSware was ever a teacher."
- The bar is extremely low. A competent mobile experience would be a genuine differentiator.

**Options:**
1. **React Native / Expo** — share code with web, faster development, good enough performance
2. **PWA** — lowest effort, works on all platforms, but no App Store presence and limited push notifications on iOS
3. **Native Swift + Kotlin** — best performance, highest effort, probably overkill

**How to apply:** Build after core Irish statutory integrations. The mobile app is what teachers interact with most — if attendance marking is fast and reliable, word spreads through staff rooms. Target a "teacher attendance app" MVP first, expand from there.
