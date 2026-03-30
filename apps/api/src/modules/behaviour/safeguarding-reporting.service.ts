import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import {
  PRISMA_TO_ACTION_TYPE,
  PRISMA_TO_CONCERN_TYPE,
  PRISMA_TO_SEVERITY,
  PRISMA_TO_STATUS,
} from './safeguarding-enum-maps';

// ─── Case File HTML Builder Types ─────────────────────────────────────────────

interface CaseFileConcern {
  id: string;
  concern_number: string;
  concern_type: string;
  severity: string;
  status: string;
  description: string;
  immediate_actions_taken: string | null;
  is_tusla_referral: boolean;
  tusla_reference_number: string | null;
  tusla_referred_at: Date | null;
  tusla_outcome: string | null;
  is_garda_referral: boolean;
  garda_reference_number: string | null;
  garda_referred_at: Date | null;
  resolution_notes: string | null;
  resolved_at: Date | null;
  sealed_at: Date | null;
  sealed_reason: string | null;
  retention_until: Date | null;
  created_at: Date;
  updated_at: Date;
  student: { id: string; first_name: string; last_name: string; date_of_birth: Date | null } | null;
  reported_by: { id: string; first_name: string; last_name: string };
  designated_liaison: { id: string; first_name: string; last_name: string } | null;
  assigned_to: { id: string; first_name: string; last_name: string } | null;
  sealed_by: { id: string; first_name: string; last_name: string } | null;
  seal_approved_by: { id: string; first_name: string; last_name: string } | null;
  actions: Array<{
    id: string;
    action_type: string;
    description: string;
    created_at: Date;
    action_by: { id: string; first_name: string; last_name: string };
  }>;
  concern_incidents: Array<{
    incident: {
      id: string;
      occurred_at: Date;
      parent_description: string | null;
      location: string | null;
      polarity: string;
      status: string;
      category: { name: string } | null;
    };
  }>;
}

@Injectable()
export class SafeguardingReportingService {
  private readonly logger = new Logger(SafeguardingReportingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderingService: PdfRenderingService,
  ) {}

  // ─── Dashboard ──────────────────────────────────────────────────────────

  async getDashboard(tenantId: string) {
    const openStatuses = [
      'reported',
      'acknowledged',
      'under_investigation',
      'referred',
      'sg_monitoring',
    ] as $Enums.SafeguardingStatus[];

    const [bySeverity, byStatus, slaOverdue, slaDueSoon, slaOnTrack, overdueTasks, recentActions] =
      await Promise.all([
        // Open by severity
        this.prisma.safeguardingConcern.groupBy({
          by: ['severity'],
          where: { tenant_id: tenantId, status: { in: openStatuses } },
          _count: true,
        }),
        // By status
        this.prisma.safeguardingConcern.groupBy({
          by: ['status'],
          where: { tenant_id: tenantId, status: { in: openStatuses } },
          _count: true,
        }),
        // SLA overdue
        this.prisma.safeguardingConcern.count({
          where: {
            tenant_id: tenantId,
            sla_first_response_met_at: null,
            sla_first_response_due: { lt: new Date() },
            status: { in: openStatuses },
          },
        }),
        // SLA due within 24h
        this.prisma.safeguardingConcern.count({
          where: {
            tenant_id: tenantId,
            sla_first_response_met_at: null,
            sla_first_response_due: {
              gte: new Date(),
              lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
            status: { in: openStatuses },
          },
        }),
        // SLA on track
        this.prisma.safeguardingConcern.count({
          where: {
            tenant_id: tenantId,
            status: { in: openStatuses },
            OR: [
              { sla_first_response_met_at: { not: null } },
              { sla_first_response_due: { gt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
            ],
          },
        }),
        // Overdue tasks
        this.prisma.behaviourTask.findMany({
          where: {
            tenant_id: tenantId,
            entity_type: {
              in: ['safeguarding_concern', 'break_glass_grant'] as $Enums.BehaviourTaskEntityType[],
            },
            status: { in: ['pending', 'in_progress', 'overdue'] as $Enums.BehaviourTaskStatus[] },
            due_date: { lt: new Date() },
          },
          take: 10,
          orderBy: { due_date: 'asc' },
        }),
        // Recent actions
        this.prisma.safeguardingAction.findMany({
          where: { tenant_id: tenantId },
          orderBy: { created_at: 'desc' },
          take: 10,
          include: {
            action_by: { select: { id: true, first_name: true, last_name: true } },
            concern: { select: { concern_number: true } },
          },
        }),
      ]);

    const severityMap: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const row of bySeverity) {
      const key = PRISMA_TO_SEVERITY[row.severity] ?? row.severity;
      severityMap[key] = row._count;
    }

    const statusMap: Record<string, number> = {
      reported: 0,
      acknowledged: 0,
      under_investigation: 0,
      referred: 0,
      monitoring: 0,
    };
    for (const row of byStatus) {
      const key = PRISMA_TO_STATUS[row.status] ?? row.status;
      statusMap[key] = row._count;
    }

    const totalOpen = slaOverdue + slaDueSoon + slaOnTrack;
    const complianceRate =
      totalOpen > 0 ? Math.round(((slaOnTrack + slaDueSoon) / totalOpen) * 100) : 100;

    return {
      data: {
        open_by_severity: severityMap,
        sla_compliance: {
          overdue: slaOverdue,
          due_within_24h: slaDueSoon,
          on_track: slaOnTrack,
          compliance_rate: complianceRate,
        },
        by_status: statusMap,
        overdue_tasks: overdueTasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          due_date: t.due_date?.toISOString() ?? null,
          entity_type: t.entity_type,
          entity_id: t.entity_id,
        })),
        recent_actions: recentActions.map((a) => ({
          id: a.id,
          concern_number: a.concern?.concern_number ?? null,
          action_type: PRISMA_TO_ACTION_TYPE[a.action_type] ?? a.action_type,
          description: a.description,
          created_at: a.created_at.toISOString(),
          action_by: a.action_by
            ? { id: a.action_by.id, name: `${a.action_by.first_name} ${a.action_by.last_name}` }
            : null,
        })),
      },
    };
  }

  // ─── Case File PDF Generation ─────────────────────────────────────────

  async generateCaseFile(tenantId: string, concernId: string, redacted: boolean): Promise<Buffer> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const data = (await rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // 1. Load the concern with all related data
        const concern = await db.safeguardingConcern.findFirst({
          where: { id: concernId, tenant_id: tenantId },
          include: {
            student: {
              select: { id: true, first_name: true, last_name: true, date_of_birth: true },
            },
            reported_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            designated_liaison: {
              select: { id: true, first_name: true, last_name: true },
            },
            assigned_to: {
              select: { id: true, first_name: true, last_name: true },
            },
            sealed_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            seal_approved_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            actions: {
              orderBy: { created_at: 'asc' },
              include: {
                action_by: {
                  select: { id: true, first_name: true, last_name: true },
                },
              },
            },
            concern_incidents: {
              include: {
                incident: {
                  select: {
                    id: true,
                    occurred_at: true,
                    parent_description: true,
                    location: true,
                    polarity: true,
                    status: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        });

        if (!concern) {
          throw new NotFoundException({
            code: 'CONCERN_NOT_FOUND',
            message: 'Safeguarding concern not found',
          });
        }

        // 2. Load school name for branding
        const tenantSettings = await db.tenantSetting.findFirst({
          where: { tenant_id: tenantId },
          select: { settings: true },
        });
        const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
        const schoolName = (settings.school_name as string) ?? 'School';

        return { concern, schoolName };
      },
      { timeout: 30000 },
    )) as {
      concern: CaseFileConcern;
      schoolName: string;
    };

    // Build HTML and render outside transaction
    const html = buildCaseFileHtml(data.concern, data.schoolName, redacted);
    const pdfBuffer = await this.pdfRenderingService.renderFromHtml(html);

    this.logger.log(
      `Generated ${redacted ? 'redacted ' : ''}case file PDF for concern ${concernId} (${data.concern.actions.length} actions, ${data.concern.concern_incidents.length} linked incidents)`,
    );

    return pdfBuffer;
  }
}

// ─── Case File HTML Builder ──────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPersonName(
  person: { first_name: string; last_name: string } | null | undefined,
  redacted: boolean,
  label: string,
): string {
  if (!person) return 'N/A';
  if (redacted) return label;
  return `${person.first_name} ${person.last_name}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactNames(text: string, concern: CaseFileConcern): string {
  let result = text;
  if (concern.student) {
    const fullName = `${concern.student.first_name} ${concern.student.last_name}`;
    result = result
      .replace(new RegExp(escapeRegExp(fullName), 'gi'), 'Student A')
      .replace(new RegExp(escapeRegExp(concern.student.first_name), 'gi'), 'Student A')
      .replace(new RegExp(escapeRegExp(concern.student.last_name), 'gi'), '[REDACTED]');
  }
  if (concern.reported_by) {
    const fullName = `${concern.reported_by.first_name} ${concern.reported_by.last_name}`;
    result = result
      .replace(new RegExp(escapeRegExp(fullName), 'gi'), '[Reporter]')
      .replace(new RegExp(escapeRegExp(concern.reported_by.first_name), 'gi'), '[Reporter]')
      .replace(new RegExp(escapeRegExp(concern.reported_by.last_name), 'gi'), '[REDACTED]');
  }
  return result;
}

function buildCaseFileHtml(
  concern: CaseFileConcern,
  schoolName: string,
  redacted: boolean,
): string {
  const dateOpts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  const dateTimeOpts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  const watermarkText = redacted
    ? 'REDACTED \\2014 SAFEGUARDING'
    : 'STRICTLY CONFIDENTIAL \\2014 SAFEGUARDING';

  const subtitleText = redacted ? 'REDACTED SAFEGUARDING CASE FILE' : 'SAFEGUARDING CASE FILE';

  // Build student name tracking for redaction
  const studentName = redacted
    ? 'Student A'
    : concern.student
      ? `${concern.student.first_name} ${concern.student.last_name}`
      : 'Unknown';

  const studentDob = concern.student?.date_of_birth
    ? concern.student.date_of_birth.toLocaleDateString('en-IE', dateOpts)
    : 'N/A';

  const reporterName = formatPersonName(concern.reported_by, redacted, '[Reporter]');
  const liaisonName = formatPersonName(
    concern.designated_liaison,
    redacted,
    '[Designated Liaison]',
  );
  const assigneeName = formatPersonName(concern.assigned_to, redacted, '[Assigned Staff]');

  const concernType = (
    PRISMA_TO_CONCERN_TYPE[concern.concern_type] ?? concern.concern_type
  ).replace(/_/g, ' ');
  const severity = PRISMA_TO_SEVERITY[concern.severity] ?? concern.severity;
  const status = (PRISMA_TO_STATUS[concern.status] ?? concern.status).replace(/_/g, ' ');

  // Description — redact any student/reporter names if redacted
  let descriptionText = concern.description;
  if (redacted && concern.student) {
    const studentFirst = concern.student.first_name;
    const studentLast = concern.student.last_name;
    const studentFull = `${studentFirst} ${studentLast}`;
    descriptionText = descriptionText
      .replace(new RegExp(escapeRegExp(studentFull), 'gi'), 'Student A')
      .replace(new RegExp(escapeRegExp(studentFirst), 'gi'), 'Student A')
      .replace(new RegExp(escapeRegExp(studentLast), 'gi'), '[REDACTED]');
  }
  if (redacted && concern.reported_by) {
    const reporterFull = `${concern.reported_by.first_name} ${concern.reported_by.last_name}`;
    descriptionText = descriptionText
      .replace(new RegExp(escapeRegExp(reporterFull), 'gi'), '[Reporter]')
      .replace(new RegExp(escapeRegExp(concern.reported_by.first_name), 'gi'), '[Reporter]')
      .replace(new RegExp(escapeRegExp(concern.reported_by.last_name), 'gi'), '[REDACTED]');
  }

  // Referrals section
  let referralsHtml = '';
  if (concern.is_tusla_referral || concern.is_garda_referral) {
    referralsHtml = `<div class="section">
      <h2>Referrals</h2>
      <table>
        <thead>
          <tr>
            <th>Agency</th>
            <th>Reference Number</th>
            <th>Date Referred</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>`;

    if (concern.is_tusla_referral) {
      referralsHtml += `<tr>
        <td>Tusla (Child &amp; Family Agency)</td>
        <td>${escapeHtml(concern.tusla_reference_number ?? 'N/A')}</td>
        <td>${concern.tusla_referred_at ? concern.tusla_referred_at.toLocaleDateString('en-IE', dateOpts) : 'N/A'}</td>
        <td>${escapeHtml(concern.tusla_outcome ?? 'Pending')}</td>
      </tr>`;
    }

    if (concern.is_garda_referral) {
      referralsHtml += `<tr>
        <td>An Garda S&iacute;och&aacute;na</td>
        <td>${escapeHtml(concern.garda_reference_number ?? 'N/A')}</td>
        <td>${concern.garda_referred_at ? concern.garda_referred_at.toLocaleDateString('en-IE', dateOpts) : 'N/A'}</td>
        <td>&mdash;</td>
      </tr>`;
    }

    referralsHtml += '</tbody></table></div>';
  }

  // Actions timeline
  const actionRows =
    concern.actions.length > 0
      ? concern.actions
          .map((a) => {
            const actionBy = formatPersonName(a.action_by, redacted, '[Staff]');
            let actionDesc = a.description;
            if (redacted) {
              actionDesc = redactNames(actionDesc, concern);
            }
            return `<tr>
            <td>${a.created_at.toLocaleDateString('en-IE', dateTimeOpts)}</td>
            <td>${escapeHtml(a.action_type.replace(/_/g, ' '))}</td>
            <td>${escapeHtml(actionBy)}</td>
            <td>${escapeHtml(actionDesc)}</td>
          </tr>`;
          })
          .join('')
      : '<tr><td colspan="4" class="empty">No actions recorded</td></tr>';

  // Linked incidents
  const incidentRows =
    concern.concern_incidents.length > 0
      ? concern.concern_incidents
          .map((ci) => {
            const inc = ci.incident;
            let incDesc = inc.parent_description ?? '';
            if (redacted) {
              incDesc = redactNames(incDesc, concern);
            }
            return `<tr>
            <td>${inc.occurred_at.toLocaleDateString('en-IE', dateOpts)}</td>
            <td>${escapeHtml(inc.category?.name ?? 'N/A')}</td>
            <td>${escapeHtml(inc.polarity)}</td>
            <td>${escapeHtml(inc.location ?? 'N/A')}</td>
            <td>${escapeHtml(incDesc)}</td>
          </tr>`;
          })
          .join('')
      : '<tr><td colspan="5" class="empty">No linked incidents</td></tr>';

  // Resolution section
  let resolutionHtml = '';
  if (concern.resolved_at ?? concern.resolution_notes) {
    let resNotes = concern.resolution_notes ?? '';
    if (redacted) {
      resNotes = redactNames(resNotes, concern);
    }
    resolutionHtml = `<div class="section">
      <h2>Resolution</h2>
      <table>
        <tbody>
          <tr><td class="label-cell">Resolved At</td><td>${concern.resolved_at ? concern.resolved_at.toLocaleDateString('en-IE', dateTimeOpts) : 'N/A'}</td></tr>
          <tr><td class="label-cell">Resolution Notes</td><td>${escapeHtml(resNotes) || 'N/A'}</td></tr>
        </tbody>
      </table>
    </div>`;
  }

  // Seal section
  let sealHtml = '';
  if (concern.sealed_at) {
    sealHtml = `<div class="section">
      <h2>Seal Information</h2>
      <table>
        <tbody>
          <tr><td class="label-cell">Sealed At</td><td>${concern.sealed_at.toLocaleDateString('en-IE', dateTimeOpts)}</td></tr>
          <tr><td class="label-cell">Sealed By</td><td>${escapeHtml(formatPersonName(concern.sealed_by, redacted, '[Sealer]'))}</td></tr>
          <tr><td class="label-cell">Approved By</td><td>${escapeHtml(formatPersonName(concern.seal_approved_by, redacted, '[Approver]'))}</td></tr>
          <tr><td class="label-cell">Reason</td><td>${escapeHtml(concern.sealed_reason ?? 'N/A')}</td></tr>
          <tr><td class="label-cell">Retention Until</td><td>${concern.retention_until ? concern.retention_until.toLocaleDateString('en-IE', dateOpts) : 'N/A'}</td></tr>
        </tbody>
      </table>
    </div>`;
  }

  const generatedDate = new Date().toLocaleDateString('en-IE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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
  @page { margin: 20mm; }
  body::after {
    content: "${watermarkText}";
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 60px;
    color: rgba(200, 50, 50, 0.15);
    z-index: 1000;
    pointer-events: none;
    white-space: nowrap;
  }
  .header {
    text-align: center;
    border-bottom: 3px solid #c00;
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
    letter-spacing: 1.5px;
  }
  .header .concern-number {
    font-size: 11px;
    color: #666;
    margin-top: 4px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
    margin-bottom: 15px;
    padding: 10px 12px;
    background: #fdf2f2;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
  }
  .info-grid .info-item {
    font-size: 11px;
  }
  .info-grid .info-item strong {
    color: #555;
    min-width: 120px;
    display: inline-block;
  }
  .severity-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .severity-low { background: #d4edda; color: #155724; }
  .severity-medium { background: #fff3cd; color: #856404; }
  .severity-high { background: #f8d7da; color: #721c24; }
  .severity-critical { background: #c00; color: #fff; }
  .section { margin-bottom: 16px; page-break-inside: avoid; }
  .section h2 {
    font-size: 13px;
    color: #c00;
    border-bottom: 1px solid #ddd;
    padding-bottom: 3px;
    margin-bottom: 6px;
  }
  .description-block {
    padding: 8px 12px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    white-space: pre-wrap;
    font-size: 11px;
    line-height: 1.5;
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
  .label-cell {
    font-weight: bold;
    width: 160px;
    color: #555;
    background: #f8f8f8;
  }
  .empty {
    text-align: center;
    color: #999;
    font-style: italic;
    padding: 10px;
  }
  .footer {
    margin-top: 20px;
    padding-top: 8px;
    border-top: 2px solid #c00;
    font-size: 9px;
    color: #999;
    display: flex;
    justify-content: space-between;
  }
  .footer .warning {
    color: #c00;
    font-weight: bold;
  }
</style>
</head>
<body>

<div class="header">
  <h1>${escapeHtml(schoolName)}</h1>
  <div class="subtitle">${subtitleText}</div>
  <div class="concern-number">Ref: ${escapeHtml(concern.concern_number)}</div>
</div>

<div class="info-grid">
  <div class="info-item"><strong>Student:</strong> ${escapeHtml(studentName)}</div>
  <div class="info-item"><strong>Date of Birth:</strong> ${redacted ? '[REDACTED]' : escapeHtml(studentDob)}</div>
  <div class="info-item"><strong>Concern Type:</strong> ${escapeHtml(concernType)}</div>
  <div class="info-item"><strong>Severity:</strong> <span class="severity-badge severity-${severity}">${escapeHtml(severity)}</span></div>
  <div class="info-item"><strong>Status:</strong> ${escapeHtml(status)}</div>
  <div class="info-item"><strong>Reported By:</strong> ${escapeHtml(reporterName)}</div>
  <div class="info-item"><strong>Designated Liaison:</strong> ${escapeHtml(liaisonName)}</div>
  <div class="info-item"><strong>Assigned To:</strong> ${escapeHtml(assigneeName)}</div>
  <div class="info-item"><strong>Date Reported:</strong> ${concern.created_at.toLocaleDateString('en-IE', dateOpts)}</div>
  <div class="info-item"><strong>Last Updated:</strong> ${concern.updated_at.toLocaleDateString('en-IE', dateOpts)}</div>
</div>

<div class="section">
  <h2>Description of Concern</h2>
  <div class="description-block">${escapeHtml(descriptionText)}</div>
</div>

${
  concern.immediate_actions_taken
    ? `<div class="section">
  <h2>Immediate Actions Taken</h2>
  <div class="description-block">${escapeHtml(redacted ? redactNames(concern.immediate_actions_taken, concern) : concern.immediate_actions_taken)}</div>
</div>`
    : ''
}

${referralsHtml}

<div class="section">
  <h2>Action Timeline (${concern.actions.length} entries)</h2>
  <table>
    <thead>
      <tr>
        <th>Date/Time</th>
        <th>Action Type</th>
        <th>By</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>${actionRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Linked Incidents (${concern.concern_incidents.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Polarity</th>
        <th>Location</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>${incidentRows}</tbody>
  </table>
</div>

${resolutionHtml}
${sealHtml}

<div class="footer">
  <span class="warning">SAFEGUARDING &mdash; ${redacted ? 'REDACTED COPY' : 'STRICTLY CONFIDENTIAL'}</span>
  <span>Generated: ${escapeHtml(generatedDate)}</span>
</div>

</body>
</html>`;
}
