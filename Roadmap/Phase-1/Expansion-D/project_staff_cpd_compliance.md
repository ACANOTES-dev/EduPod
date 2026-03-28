---
name: Staff CPD & Compliance Tracking
description: NICE-TO-HAVE — Teaching Council CPD requirements, Garda vetting, Children First training, certification expiry alerts. Inspection-readiness sells to principals.
type: project
---

**Priority:** Nice-to-have. Inspection readiness is a constant anxiety for principals.

**What it is:**
A module that tracks all staff certifications, training requirements, and continuing professional development (CPD) — with expiry alerts and compliance reporting. The Teaching Council's Cosán framework requires teachers to maintain CPD records. Schools must track Garda vetting, Children First training, manual handling, first aid — all with expiry dates.

**What EduPod should build:**
- **Certification tracking:**
  - Garda vetting (police clearance) — date, status, expiry
  - Children First training — completion date, renewal due
  - First aid certification — expiry date
  - Manual handling — expiry date
  - Subject-specific qualifications
  - Custom certification types (tenant-configurable)
- **Expiry alerts:** automated notifications to staff member and admin when certifications approach expiry (30-day, 14-day, 7-day)
- **Non-compliance flags:** dashboard showing staff with expired or missing certifications
- **CPD log:**
  - Activity recording: type (course, conference, peer learning, action research), hours, date, provider
  - Evidence upload: certificates, reflections, portfolios
  - Cosán framework alignment: tag activities to Teaching Council standards
  - Annual CPD summary per teacher
- **Compliance dashboard:**
  - School-wide compliance status at a glance
  - Percentage of staff fully compliant
  - Upcoming expirations
  - Overdue certifications
  - Ready for DES/DEIS inspection
- **Single Central Record:** consolidated view of all staff vetting and compliance checks (similar to Compass's SCR feature)
- **Reports:** generate compliance reports for inspections, Board meetings, DES returns

**Competitor status:**
- Compass: has "Single Central Record" (vetting checks) and "Professional Development" as separate modules
- VSware: no equivalent
- Nobody integrates compliance tracking with CPD into one unified view

**Effort estimate:** Low-Medium — straightforward data models (certifications with expiry dates, CPD activities). The alerting infrastructure exists. Main work is the compliance dashboard and reporting views.

**How to apply:** Build after higher-priority items. This is a feature that sells to principals during inspections — "are you inspection-ready right now?" If the answer is "I don't know," EduPod's answer is "yes, here's your compliance dashboard."
