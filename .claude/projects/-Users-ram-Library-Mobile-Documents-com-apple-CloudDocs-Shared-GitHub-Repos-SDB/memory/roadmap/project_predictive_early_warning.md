---
name: Predictive Early Warning System
description: SHOULD-HAVE — Cross-module AI that correlates attendance + grades + behaviour + wellbeing + parent engagement to flag at-risk students before they fail.
type: project
---

**Priority:** Should-have. Unique in the market. No competitor does this.

**What it is:**
An AI layer that sits across all student data modules and identifies students at risk of academic failure, dropout, or wellbeing crisis — before the crisis happens. Individual data points (attendance dip, grade slip, behaviour incident, parent disengagement) are often caught too late when treated in isolation. The system correlates them to surface patterns that humans miss.

**What EduPod should build:**
- **Risk scoring engine:** weighted composite score across attendance, grades, behaviour, wellbeing, parent engagement (portal logins, communication opens, payment timeliness)
- **Threshold alerts:** configurable per school — when a student crosses from "monitoring" to "intervention needed"
- **Weekly principal digest:** "These 7 students need attention this week" with supporting data points from each module
- **Trend detection:** not just current state but trajectory — "this student's attendance has declined for 3 consecutive weeks"
- **Cohort risk view:** year group or class level risk heatmap — identify systemic issues (e.g., entire class declining in maths)
- **Intervention tracking integration:** when a student is flagged, link directly to creating an intervention plan (wellbeing module)
- **Historical validation:** compare predictions against actual outcomes to improve the model over time
- **Configurable risk factors:** schools choose which signals matter most for their context

**Why it's revolutionary:**
- No school MIS correlates data across all modules to predict risk
- EduPod is uniquely positioned because it HAS all the data in one platform — attendance, grades, behaviour, finance, communications, wellbeing
- Compass has siloed modules. VSware has siloed modules. Neither can do cross-module intelligence.
- This is the feature that makes a principal say "this system saved a child from falling through the cracks"

**Dependencies:** Requires behaviour management and wellbeing modules to be built first for full effectiveness. However, a v1 using just attendance + grades + parent engagement could launch earlier.

**Effort estimate:** Medium — the data exists across modules. The AI layer is pattern matching and scoring, not complex ML. The existing academic risk alerts in the gradebook module provide the architectural pattern.

**How to apply:** Build a v1 after behaviour and wellbeing modules are complete. Start with attendance + grades + behaviour correlation. Add wellbeing and parent engagement signals in v2. This is a headline demo feature — "watch me show you which students in your school need help this week."
