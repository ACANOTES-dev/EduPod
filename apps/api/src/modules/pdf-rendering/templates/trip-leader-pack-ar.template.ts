import type { PdfBranding } from '../pdf-rendering.service';

interface EmergencyContact {
  contact_name: string;
  phone: string;
  relationship_label: string;
}

interface TripStudent {
  name: string;
  year_group: string;
  class_name: string;
  date_of_birth: string;
  medical_notes: string | null;
  has_allergy: boolean;
  allergy_details: string | null;
  emergency_contacts: EmergencyContact[];
  consent_status: string;
  consent_submitted_at: string | null;
}

interface TripLeaderPackData {
  event: {
    title: string;
    title_ar?: string | null;
    start_date: string;
    end_date: string;
    start_time: Date | null;
    end_time: Date | null;
    location: string;
    location_ar?: string | null;
    risk_assessment_approved: boolean;
  };
  staff: Array<{
    id: string;
    role: string;
  }>;
  students: TripStudent[];
  generated_at: string;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
}

function consentBadge(status: string): string {
  const isGranted = status.toLowerCase() === 'granted';
  const color = isGranted ? '#16a34a' : '#d97706';
  const label = isGranted
    ? '\u0645\u0645\u0646\u0648\u062D\u0629'
    : '\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631';
  return `<span style="display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: ${color}20; color: ${color}; border: 1px solid ${color}40;">${label}</span>`;
}

export function renderTripLeaderPackAr(data: unknown, branding: PdfBranding): string {
  const d = data as TripLeaderPackData;
  const primaryColor = branding.primary_color || '#1e40af';
  const schoolName = branding.school_name_ar || branding.school_name;
  const eventTitle = d.event.title_ar || d.event.title;
  const eventLocation = d.event.location_ar || d.event.location;

  const sectionHeading = (title: string): string =>
    `<h2 style="font-size: 14px; font-weight: 700; color: ${primaryColor}; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid ${primaryColor}20;">${title}</h2>`;

  const thStyle = `padding: 8px; text-align: right; font-size: 11px; font-weight: 700; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb; white-space: nowrap;`;
  const tdStyle = `padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right;`;

  // ─── Event Summary ────────────────────────────────────────────────────────────

  const dateDisplay =
    d.event.start_date === d.event.end_date
      ? escapeHtml(d.event.start_date)
      : `${escapeHtml(d.event.start_date)} &mdash; ${escapeHtml(d.event.end_date)}`;

  const timeDisplay =
    d.event.start_time || d.event.end_time
      ? `${formatTime(d.event.start_time)}${d.event.end_time ? ` &mdash; ${formatTime(d.event.end_time)}` : ''}`
      : null;

  const riskBadge = d.event.risk_assessment_approved
    ? `<span style="display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0;">\u0645\u0639\u062A\u0645\u062F &#10003;</span>`
    : `<span style="display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;">\u063A\u064A\u0631 \u0645\u0639\u062A\u0645\u062F</span>`;

  // ─── Staff rows ───────────────────────────────────────────────────────────────

  const staffRows = d.staff
    .map(
      (s) => `
    <tr>
      <td style="${tdStyle}" dir="ltr">${escapeHtml(s.id)}</td>
      <td style="${tdStyle}">${escapeHtml(s.role)}</td>
    </tr>`,
    )
    .join('');

  // ─── Student roster rows ──────────────────────────────────────────────────────

  const studentRows = d.students
    .map(
      (s) => `
    <tr>
      <td style="${tdStyle}">${escapeHtml(s.name)}</td>
      <td style="${tdStyle}">${escapeHtml(s.year_group)}</td>
      <td style="${tdStyle}">${escapeHtml(s.class_name)}</td>
      <td style="${tdStyle} white-space: nowrap;" dir="ltr">${escapeHtml(s.date_of_birth)}</td>
    </tr>`,
    )
    .join('');

  // ─── Medical information rows ─────────────────────────────────────────────────

  const medicalStudents = d.students.filter((s) => s.medical_notes || s.has_allergy);

  const medicalRows = medicalStudents
    .map(
      (s) => `
    <tr>
      <td style="${tdStyle}">${escapeHtml(s.name)}</td>
      <td style="${tdStyle}">${s.medical_notes ? escapeHtml(s.medical_notes) : '<span style="color: #9ca3af;">&mdash;</span>'}</td>
      <td style="${tdStyle}">${
        s.has_allergy
          ? `<div style="background: #fef2f2; border-right: 3px solid #dc2626; padding: 4px 8px; border-radius: 2px; font-size: 12px;">${escapeHtml(s.allergy_details)}</div>`
          : '\u0644\u0627 \u064A\u0648\u062C\u062F'
      }</td>
    </tr>`,
    )
    .join('');

  // ─── Emergency contacts ───────────────────────────────────────────────────────

  const studentsWithContacts = d.students.filter((s) => s.emergency_contacts.length > 0);

  const emergencyContactsHtml = studentsWithContacts
    .map(
      (s) => `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">${escapeHtml(s.name)}</h3>
      <table>
        <thead>
          <tr>
            <th style="${thStyle}">\u0627\u0633\u0645 \u062C\u0647\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644</th>
            <th style="${thStyle}">\u0627\u0644\u0647\u0627\u062A\u0641</th>
            <th style="${thStyle}">\u0627\u0644\u0639\u0644\u0627\u0642\u0629</th>
          </tr>
        </thead>
        <tbody>
          ${s.emergency_contacts
            .map(
              (ec) => `
          <tr>
            <td style="${tdStyle}">${escapeHtml(ec.contact_name)}</td>
            <td style="${tdStyle} white-space: nowrap;" dir="ltr">${escapeHtml(ec.phone)}</td>
            <td style="${tdStyle}">${escapeHtml(ec.relationship_label)}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`,
    )
    .join('');

  // ─── Consent status rows ──────────────────────────────────────────────────────

  const consentRows = d.students
    .map(
      (s) => `
    <tr>
      <td style="${tdStyle}">${escapeHtml(s.name)}</td>
      <td style="${tdStyle}">${consentBadge(s.consent_status)}</td>
      <td style="${tdStyle} white-space: nowrap;" dir="ltr">${s.consent_submitted_at ? escapeHtml(s.consent_submitted_at) : '<span style="color: #9ca3af;">&mdash;</span>'}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans Arabic', 'Segoe UI', Tahoma, 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 14px; background: white; direction: rtl; padding: 20mm; }
    @page { size: A4; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
    <div>
      <p style="font-size: 13px; font-weight: 600; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(schoolName)}</p>
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">\u062D\u0642\u064A\u0628\u0629 \u0642\u0627\u0626\u062F \u0627\u0644\u0631\u062D\u0644\u0629</h1>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0646\u0634\u0627\u0621: <span dir="ltr">${escapeHtml(d.generated_at)}</span></p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="\u0627\u0644\u0634\u0639\u0627\u0631" style="height: 56px; max-width: 120px; object-fit: contain;">` : ''}
  </div>

  <!-- Event Summary -->
  ${sectionHeading('\u0645\u0644\u062E\u0635 \u0627\u0644\u0641\u0639\u0627\u0644\u064A\u0629')}
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px 20px; margin-bottom: 8px;">
    <div style="display: flex; gap: 40px; flex-wrap: wrap;">
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">\u0627\u0644\u0639\u0646\u0648\u0627\u0646</p>
        <p style="font-size: 16px; font-weight: 700; color: #111827;">${escapeHtml(eventTitle)}</p>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">\u0627\u0644\u062A\u0627\u0631\u064A\u062E</p>
        <p style="font-size: 14px; font-weight: 500; color: #111827;" dir="ltr">${dateDisplay}</p>
      </div>
      ${
        timeDisplay
          ? `<div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">\u0627\u0644\u0648\u0642\u062A</p>
        <p style="font-size: 14px; font-weight: 500; color: #111827;" dir="ltr">${timeDisplay}</p>
      </div>`
          : ''
      }
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">\u0627\u0644\u0645\u0648\u0642\u0639</p>
        <p style="font-size: 14px; font-weight: 500; color: #111827;">${escapeHtml(eventLocation)}</p>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u062E\u0627\u0637\u0631</p>
        <p style="margin-top: 2px;">${riskBadge}</p>
      </div>
    </div>
  </div>

  <!-- Staff List -->
  ${sectionHeading('\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646')}
  ${
    d.staff.length > 0
      ? `<table>
    <thead>
      <tr>
        <th style="${thStyle}">\u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0638\u0641</th>
        <th style="${thStyle}">\u0627\u0644\u062F\u0648\u0631</th>
      </tr>
    </thead>
    <tbody>
      ${staffRows}
    </tbody>
  </table>`
      : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0648\u0638\u0641\u0648\u0646 \u0645\u0639\u064A\u0646\u0648\u0646.</p>`
  }

  <!-- Student Roster -->
  ${sectionHeading(`\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0637\u0644\u0627\u0628 (${d.students.length})`)}
  ${
    d.students.length > 0
      ? `<table>
    <thead>
      <tr>
        <th style="${thStyle}">\u0627\u0644\u0627\u0633\u0645</th>
        <th style="${thStyle}">\u0627\u0644\u0645\u0631\u062D\u0644\u0629</th>
        <th style="${thStyle}">\u0627\u0644\u0635\u0641</th>
        <th style="${thStyle}">\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u064A\u0644\u0627\u062F</th>
      </tr>
    </thead>
    <tbody>
      ${studentRows}
    </tbody>
  </table>`
      : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">\u0644\u0627 \u064A\u0648\u062C\u062F \u0637\u0644\u0627\u0628 \u0645\u0639\u064A\u0646\u0648\u0646.</p>`
  }

  <!-- Medical Information -->
  ${sectionHeading('\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0637\u0628\u064A\u0629')}
  ${
    medicalStudents.length > 0
      ? `<table>
    <thead>
      <tr>
        <th style="${thStyle}">\u0627\u0644\u0627\u0633\u0645</th>
        <th style="${thStyle}">\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0637\u0628\u064A\u0629</th>
        <th style="${thStyle}">\u0627\u0644\u062D\u0633\u0627\u0633\u064A\u0629</th>
      </tr>
    </thead>
    <tbody>
      ${medicalRows}
    </tbody>
  </table>`
      : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0637\u0628\u064A\u0629 \u0645\u0633\u062C\u0644\u0629.</p>`
  }

  <!-- Emergency Contacts -->
  ${sectionHeading('\u062C\u0647\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0641\u064A \u062D\u0627\u0644\u0627\u062A \u0627\u0644\u0637\u0648\u0627\u0631\u0626')}
  ${studentsWithContacts.length > 0 ? emergencyContactsHtml : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">\u0644\u0627 \u062A\u0648\u062C\u062F \u062C\u0647\u0627\u062A \u0627\u062A\u0635\u0627\u0644 \u0645\u0633\u062C\u0644\u0629.</p>`}

  <!-- Consent Status -->
  ${sectionHeading('\u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629')}
  ${
    d.students.length > 0
      ? `<table>
    <thead>
      <tr>
        <th style="${thStyle}">\u0627\u0644\u0627\u0633\u0645</th>
        <th style="${thStyle}">\u0627\u0644\u062D\u0627\u0644\u0629</th>
        <th style="${thStyle}">\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u062A\u0642\u062F\u064A\u0645</th>
      </tr>
    </thead>
    <tbody>
      ${consentRows}
    </tbody>
  </table>`
      : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">\u0644\u0627 \u064A\u0648\u062C\u062F \u0637\u0644\u0627\u0628 \u0645\u0639\u064A\u0646\u0648\u0646.</p>`
  }

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
    <p style="font-size: 11px; color: #9ca3af;">\u062A\u0645 \u0627\u0644\u0625\u0646\u0634\u0627\u0621 \u0641\u064A <span dir="ltr">${escapeHtml(d.generated_at)}</span> &mdash; \u0633\u0631\u064A &mdash; \u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0642\u0627\u0626\u062F \u0627\u0644\u0631\u062D\u0644\u0629 \u0641\u0642\u0637</p>
    <p style="font-size: 11px; color: #9ca3af;">${escapeHtml(schoolName)}</p>
  </div>

</body>
</html>`;
}
