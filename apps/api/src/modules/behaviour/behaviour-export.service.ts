import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface IncidentRow {
  date: string;
  category: string;
  polarity: string;
  status: string;
  reporter: string;
  description: string;
}

interface SanctionRow {
  type: string;
  date: string;
  status: string;
  served: string;
}

interface InterventionRow {
  title: string;
  type: string;
  status: string;
  outcome: string;
}

interface AwardRow {
  award_type: string;
  date: string;
  reason: string;
}

interface MvSummaryRow {
  positive_count: bigint | number;
  negative_count: bigint | number;
  neutral_count: bigint | number;
  total_points: bigint | number;
  positive_ratio: number | null;
}

interface StudentExportData {
  school_name: string;
  student_name: string;
  year_group: string;
  class_name: string;
  generated_date: string;
  total_incidents: number;
  positive_ratio: string;
  points_balance: number;
  incidents: IncidentRow[];
  sanctions: SanctionRow[];
  interventions: InterventionRow[];
  awards: AwardRow[];
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourExportService {
  private readonly logger = new Logger(BehaviourExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfRenderingService,
  ) {}

  /**
   * Generate a PDF export of a student's behaviour record.
   * Includes incidents, sanctions, interventions, awards, and summary stats.
   * Excludes: context_notes, safeguarding data, SEND notes.
   */
  async generateStudentPackPdf(
    tenantId: string,
    studentId: string,
    _userId: string,
    locale: string,
  ): Promise<Buffer> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const data = (await rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // 1. Load student profile
        const student = await db.student.findFirst({
          where: { id: studentId, tenant_id: tenantId, status: 'active' },
          include: {
            year_group: { select: { name: true } },
            class_enrolments: {
              where: { status: 'active' },
              include: { class_entity: { select: { name: true } } },
              take: 1,
            },
          },
        });

        if (!student) {
          throw new NotFoundException({
            code: 'STUDENT_NOT_FOUND',
            message: `Student with id "${studentId}" not found`,
          });
        }

        // 2. Load tenant/school name for branding
        const tenantSettings = await db.tenantSetting.findFirst({
          where: { tenant_id: tenantId },
          select: { settings: true },
        });
        const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
        const schoolName = (settings.school_name as string) ?? 'School';

        // 3. Load incident history (STAFF-class fields only)
        const incidents = await db.behaviourIncident.findMany({
          where: {
            tenant_id: tenantId,
            retention_status: 'active',
            status: { notIn: ['draft', 'withdrawn'] },
            participants: {
              some: {
                student_id: studentId,
                participant_type: 'student',
              },
            },
          },
          include: {
            category: { select: { name: true } },
            reported_by: { select: { first_name: true, last_name: true } },
          },
          orderBy: { occurred_at: 'desc' },
        });

        // 4. Load sanction history
        const sanctions = await db.behaviourSanction.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            retention_status: 'active',
          },
          orderBy: { scheduled_date: 'desc' },
        });

        // 5. Load intervention summary (no SEND notes)
        const interventions = await db.behaviourIntervention.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            retention_status: 'active',
          },
          orderBy: { start_date: 'desc' },
        });

        // 6. Load points from mv_student_behaviour_summary (graceful if MV empty)
        let mvSummary: MvSummaryRow | null = null;
        try {
          const rows = await db.$queryRaw<MvSummaryRow[]>`
            SELECT positive_count, negative_count, neutral_count, total_points, positive_ratio
            FROM mv_student_behaviour_summary
            WHERE tenant_id = ${tenantId}::uuid AND student_id = ${studentId}::uuid
            LIMIT 1
          `;
          mvSummary = rows[0] ?? null;
        } catch {
          this.logger.warn(
            `MV mv_student_behaviour_summary query failed for student ${studentId} — using fallback`,
          );
        }

        // 7. Load recognition awards
        const awards = await db.behaviourRecognitionAward.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
          },
          include: {
            award_type: { select: { name: true } },
          },
          orderBy: { awarded_at: 'desc' },
        });

        // Format data for template
        const dateLocale = locale === 'ar' ? 'ar-SA' : 'en-IE';
        const dateOpts: Intl.DateTimeFormatOptions = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        };

        const incidentRows: IncidentRow[] = incidents.map((i) => ({
          date: i.occurred_at.toLocaleDateString(dateLocale, dateOpts),
          category: i.category?.name ?? 'N/A',
          polarity: i.polarity.charAt(0).toUpperCase() + i.polarity.slice(1),
          status: i.status.replace(/_/g, ' '),
          reporter: `${i.reported_by.first_name} ${i.reported_by.last_name}`,
          description: i.parent_description ?? '',
        }));

        const sanctionRows: SanctionRow[] = sanctions.map((s) => ({
          type: s.type.replace(/_/g, ' '),
          date: s.scheduled_date.toLocaleDateString(dateLocale, dateOpts),
          status: s.status.replace(/_/g, ' '),
          served: s.served_at ? 'Served' : s.status === 'no_show' ? 'No-show' : '-',
        }));

        const interventionRows: InterventionRow[] = interventions.map((iv) => ({
          title: iv.title,
          type: iv.type.replace(/_/g, ' '),
          status: iv.status.replace(/_/g, ' '),
          outcome: iv.outcome ? iv.outcome.replace(/_/g, ' ') : '-',
        }));

        const awardRows: AwardRow[] = awards.map((a) => ({
          award_type: a.award_type?.name ?? 'Award',
          date: a.awarded_at.toLocaleDateString(dateLocale, dateOpts),
          reason: a.notes ?? '',
        }));

        const totalIncidents = mvSummary
          ? Number(mvSummary.positive_count) +
            Number(mvSummary.negative_count) +
            Number(mvSummary.neutral_count)
          : incidents.length;

        const positiveRatio =
          mvSummary?.positive_ratio != null
            ? `${(Number(mvSummary.positive_ratio) * 100).toFixed(1)}%`
            : 'N/A';

        const pointsBalance = mvSummary ? Number(mvSummary.total_points) : 0;

        const exportData: StudentExportData = {
          school_name: schoolName,
          student_name: `${student.first_name} ${student.last_name}`,
          year_group: student.year_group?.name ?? 'N/A',
          class_name: student.class_enrolments[0]?.class_entity?.name ?? 'N/A',
          generated_date: new Date().toLocaleDateString(dateLocale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          total_incidents: totalIncidents,
          positive_ratio: positiveRatio,
          points_balance: pointsBalance,
          incidents: incidentRows,
          sanctions: sanctionRows,
          interventions: interventionRows,
          awards: awardRows,
        };

        return exportData;
      },
      { timeout: 30000 },
    )) as StudentExportData;

    // Build HTML and render PDF outside the transaction
    const html = buildStudentPackHtml(data);
    const pdfBuffer = await this.pdfService.renderFromHtml(html);

    this.logger.log(
      `Generated student behaviour pack PDF for student ${studentId} (${data.incidents.length} incidents, ${data.sanctions.length} sanctions)`,
    );

    return pdfBuffer;
  }
}

// ─── HTML Template Builder ──────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildStudentPackHtml(data: StudentExportData): string {
  const incidentTableRows =
    data.incidents.length > 0
      ? data.incidents
          .map(
            (i) => `<tr>
            <td>${escapeHtml(i.date)}</td>
            <td>${escapeHtml(i.category)}</td>
            <td>${escapeHtml(i.polarity)}</td>
            <td>${escapeHtml(i.status)}</td>
            <td>${escapeHtml(i.reporter)}</td>
            <td>${escapeHtml(i.description)}</td>
          </tr>`,
          )
          .join('')
      : '<tr><td colspan="6" class="empty">No incidents recorded</td></tr>';

  const sanctionTableRows =
    data.sanctions.length > 0
      ? data.sanctions
          .map(
            (s) => `<tr>
            <td>${escapeHtml(s.type)}</td>
            <td>${escapeHtml(s.date)}</td>
            <td>${escapeHtml(s.status)}</td>
            <td>${escapeHtml(s.served)}</td>
          </tr>`,
          )
          .join('')
      : '<tr><td colspan="4" class="empty">No sanctions recorded</td></tr>';

  const interventionTableRows =
    data.interventions.length > 0
      ? data.interventions
          .map(
            (iv) => `<tr>
            <td>${escapeHtml(iv.title)}</td>
            <td>${escapeHtml(iv.type)}</td>
            <td>${escapeHtml(iv.status)}</td>
            <td>${escapeHtml(iv.outcome)}</td>
          </tr>`,
          )
          .join('')
      : '<tr><td colspan="4" class="empty">No interventions recorded</td></tr>';

  const awardTableRows =
    data.awards.length > 0
      ? data.awards
          .map(
            (a) => `<tr>
            <td>${escapeHtml(a.award_type)}</td>
            <td>${escapeHtml(a.date)}</td>
            <td>${escapeHtml(a.reason)}</td>
          </tr>`,
          )
          .join('')
      : '<tr><td colspan="3" class="empty">No awards recorded</td></tr>';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #333;
    line-height: 1.4;
    padding: 10px;
  }
  body::after {
    content: "CONFIDENTIAL";
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 80px;
    color: rgba(200, 200, 200, 0.3);
    z-index: 1000;
    pointer-events: none;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
    margin-bottom: 15px;
  }
  .header h1 {
    font-size: 18px;
    color: #222;
    margin-bottom: 2px;
  }
  .header .subtitle {
    font-size: 13px;
    color: #c00;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .student-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 15px;
    padding: 8px 12px;
    background: #f5f5f5;
    border-radius: 4px;
  }
  .student-info div { font-size: 11px; }
  .student-info strong { font-size: 12px; }
  .summary-cards {
    display: flex;
    gap: 12px;
    margin-bottom: 18px;
  }
  .summary-card {
    flex: 1;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 10px;
    text-align: center;
  }
  .summary-card .value {
    font-size: 20px;
    font-weight: bold;
    color: #222;
  }
  .summary-card .label {
    font-size: 10px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .section { margin-bottom: 16px; }
  .section h2 {
    font-size: 13px;
    color: #222;
    border-bottom: 1px solid #ddd;
    padding-bottom: 3px;
    margin-bottom: 6px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
  }
  th {
    background: #f0f0f0;
    padding: 5px 6px;
    border: 1px solid #ddd;
    text-align: left;
    font-weight: bold;
    font-size: 9px;
    text-transform: uppercase;
    color: #555;
  }
  td {
    padding: 4px 6px;
    border: 1px solid #ddd;
    vertical-align: top;
  }
  tr:nth-child(even) { background: #fafafa; }
  .empty {
    text-align: center;
    color: #999;
    font-style: italic;
    padding: 10px;
  }
  .footer {
    margin-top: 20px;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    font-size: 9px;
    color: #999;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

<div class="header">
  <h1>${escapeHtml(data.school_name)}</h1>
  <div class="subtitle">STUDENT BEHAVIOUR REPORT &mdash; CONFIDENTIAL</div>
</div>

<div class="student-info">
  <div><strong>Student:</strong> ${escapeHtml(data.student_name)}</div>
  <div><strong>Year Group:</strong> ${escapeHtml(data.year_group)}</div>
  <div><strong>Class:</strong> ${escapeHtml(data.class_name)}</div>
  <div><strong>Date Generated:</strong> ${escapeHtml(data.generated_date)}</div>
</div>

<div class="summary-cards">
  <div class="summary-card">
    <div class="value">${data.total_incidents}</div>
    <div class="label">Total Incidents</div>
  </div>
  <div class="summary-card">
    <div class="value">${escapeHtml(data.positive_ratio)}</div>
    <div class="label">Positive Ratio</div>
  </div>
  <div class="summary-card">
    <div class="value">${data.points_balance}</div>
    <div class="label">Points Balance</div>
  </div>
</div>

<div class="section">
  <h2>Incident History</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Polarity</th>
        <th>Status</th>
        <th>Reporter</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>${incidentTableRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Sanctions</h2>
  <table>
    <thead>
      <tr>
        <th>Type</th>
        <th>Date</th>
        <th>Status</th>
        <th>Served</th>
      </tr>
    </thead>
    <tbody>${sanctionTableRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Interventions</h2>
  <table>
    <thead>
      <tr>
        <th>Title</th>
        <th>Type</th>
        <th>Status</th>
        <th>Outcome</th>
      </tr>
    </thead>
    <tbody>${interventionTableRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Recognition Awards</h2>
  <table>
    <thead>
      <tr>
        <th>Award Type</th>
        <th>Date</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>${awardTableRows}</tbody>
  </table>
</div>

<div class="footer">
  <span>Generated: ${escapeHtml(data.generated_date)}</span>
  <span>This document is confidential and intended for authorised school personnel only.</span>
</div>

</body>
</html>`;
}
