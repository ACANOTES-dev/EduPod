---
name: Irish Payroll Provider Integration
description: SHOULD-HAVE — Partner with BrightPay or similar for Irish payroll compliance (PAYE/PRSI/USC). EduPod handles school-side workflow, provider handles tax and Revenue.
type: project
---

**Priority:** Should-have. Unique differentiator (no competitor offers payroll). Partnership approach avoids legal/compliance burden.

**What it is:**
Rather than building Irish payroll tax compliance in-house, integrate with an established Irish payroll provider (BrightPay preferred) as a calculation and compliance engine. EduPod remains the school-facing UX; the provider is invisible to the school.

**Integration model:**
```
EduPod                          Payroll Provider
─────────                       ────────────────
Staff profiles        ──push──▶  Employee records
Compensation configs  ──push──▶  Pay rates
Attendance/leave      ──push──▶  Hours/absences
Allowances/deductions ──push──▶  Pay adjustments
Approval (finalised)  ──push──▶  Trigger payrun
                      ◀──pull──  Calculated payslips (gross, tax, net)
                      ◀──pull──  Revenue submission confirmations
Display payslips      ◀──pull──  PDF payslips or payslip data
```

**Target partners (priority order):**
1. BrightPay (Thesaurus) — Irish market leader, has BrightPay Connect API, already used by many schools
2. Sage Ireland — well-known brand, has APIs
3. CollSoft (Payroll Ability) — Irish-built, popular with accountants servicing schools

**The pitch to BrightPay:**
"Every school we onboard becomes a BrightPay customer. You handle compliance, we handle the school workflow. Channel partnership — we bring you customers in a vertical you're not specifically targeting."

**Effort estimate:**
- Technical integration: Low-Medium (API mapping, EduPod payroll data structures are clean)
- Business development: Medium (getting the partnership agreement)
- UX changes: Low (existing payroll UI stays, add sync status and calculated results display)

**How to apply:** Approach BrightPay once you have 1-2 pilot schools to demonstrate traction. The existing payroll module (compensation, attendance, allowances, deductions, approvals, payslip generation) is the school-side workflow — it's already built. The integration adds the compliance layer without carrying the legal burden.
