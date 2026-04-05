import type { PdfBranding } from '../pdf-rendering.service';

import { renderTripLeaderPackEn } from './trip-leader-pack-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const FULL_DATA = {
  event: {
    title: 'Museum Trip',
    title_ar: null,
    start_date: '2026-03-15',
    end_date: '2026-03-15',
    start_time: new Date('2026-03-15T09:00:00'),
    end_time: new Date('2026-03-15T15:00:00'),
    location: 'National Museum',
    location_ar: null,
    risk_assessment_approved: true,
  },
  staff: [
    { id: 'staff-001', role: 'Trip Leader' },
    { id: 'staff-002', role: 'First Aider' },
  ],
  students: [
    {
      name: 'Alice Smith',
      year_group: 'Year 5',
      class_name: '5A',
      date_of_birth: '2015-06-10',
      medical_notes: 'Asthma - carries inhaler',
      has_allergy: true,
      allergy_details: 'Peanut allergy',
      emergency_contacts: [
        { contact_name: 'Jane Smith', phone: '+353-1-2345678', relationship_label: 'Mother' },
      ],
      consent_status: 'granted',
      consent_submitted_at: '2026-03-10',
    },
    {
      name: 'Bob Jones',
      year_group: 'Year 5',
      class_name: '5B',
      date_of_birth: '2015-09-20',
      medical_notes: null,
      has_allergy: false,
      allergy_details: null,
      emergency_contacts: [],
      consent_status: 'pending',
      consent_submitted_at: null,
    },
  ],
  generated_at: '2026-03-12 10:30',
};

describe('renderTripLeaderPackEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string with LTR direction', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result).toContain('<html lang="en" dir="ltr">');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include school branding and logo', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('Test Academy');
    expect(result).toContain('https://example.com/logo.png');
  });

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo School' };
    const result = renderTripLeaderPackEn(FULL_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color when branding has none', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderTripLeaderPackEn(FULL_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Event Summary branches ──────────────────────────────────────────────────

  it('should display single date when start_date equals end_date', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    // Same date: should NOT contain the mdash separator for date range
    expect(result).toContain('2026-03-15');
  });

  it('should display date range when start_date differs from end_date', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, end_date: '2026-03-17' },
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).toContain('2026-03-15');
    expect(result).toContain('2026-03-17');
    expect(result).toContain('&mdash;');
  });

  it('should display time when start_time and end_time are present', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    // timeDisplay should be rendered (non-null since both times exist)
    expect(result).toContain('Time');
  });

  it('should display time with only start_time (no end_time)', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, end_time: null },
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    // timeDisplay truthy because start_time exists, but no mdash for end
    expect(result).toContain('Time');
  });

  it('should hide time section when both start_time and end_time are null', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, start_time: null, end_time: null },
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    // The time div should not be rendered
    // Only event-level "Time" heading should NOT appear (others like "Date" do)
    expect(result).not.toContain('>Time</p>');
  });

  it('should show approved risk badge when risk_assessment_approved is true', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('Approved');
    expect(result).toContain('#16a34a');
  });

  it('should show not-approved risk badge when risk_assessment_approved is false', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, risk_assessment_approved: false },
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).toContain('Not Approved');
    expect(result).toContain('#dc2626');
  });

  // ─── Staff List branches ─────────────────────────────────────────────────────

  it('should render staff table when staff exist', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('staff-001');
    expect(result).toContain('Trip Leader');
    expect(result).toContain('staff-002');
    expect(result).toContain('First Aider');
  });

  it('should show empty staff message when no staff assigned', () => {
    const data = { ...FULL_DATA, staff: [] };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).toContain('No staff assigned');
  });

  // ─── Student Roster branches ─────────────────────────────────────────────────

  it('should render student roster table', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('Alice Smith');
    expect(result).toContain('Year 5');
    expect(result).toContain('5A');
  });

  it('should show empty students message when no students', () => {
    const data = { ...FULL_DATA, students: [] };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).toContain('No students assigned');
  });

  // ─── Medical Information branches ────────────────────────────────────────────

  it('should render medical info for students with medical_notes', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('Asthma - carries inhaler');
  });

  it('should render allergy details with alert styling for students with allergies', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('Peanut allergy');
    expect(result).toContain('#dc2626');
  });

  it('should render "None" for students with no allergies in medical section', () => {
    // Create a student with medical_notes but no allergy
    const data = {
      ...FULL_DATA,
      students: [
        {
          ...FULL_DATA.students[0],
          has_allergy: false,
          allergy_details: null,
          medical_notes: 'Some condition',
        },
      ],
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).toContain('None');
  });

  it('should show dash for medical_notes when null but student has allergy', () => {
    const data = {
      ...FULL_DATA,
      students: [
        {
          ...FULL_DATA.students[0],
          medical_notes: null,
          has_allergy: true,
          allergy_details: 'Bee sting',
        },
      ],
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).toContain('&mdash;');
    expect(result).toContain('Bee sting');
  });

  it('should show no medical information message when no students have medical data', () => {
    const data = {
      ...FULL_DATA,
      students: [
        { ...FULL_DATA.students[1] }, // Bob has no medical notes or allergies
      ],
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).toContain('No medical information recorded');
  });

  // ─── Emergency Contacts branches ─────────────────────────────────────────────

  it('should render emergency contacts for students that have them', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('Jane Smith');
    expect(result).toContain('+353-1-2345678');
    expect(result).toContain('Mother');
  });

  it('should show no emergency contacts message when none exist', () => {
    const data = {
      ...FULL_DATA,
      students: [
        { ...FULL_DATA.students[1] }, // Bob has no contacts
      ],
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).toContain('No emergency contacts recorded');
  });

  // ─── Consent Status branches ─────────────────────────────────────────────────

  it('should render granted consent badge with green color', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('Granted');
  });

  it('should render pending consent badge with amber color', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('Pending');
  });

  it('should render consent submitted date when available', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('2026-03-10');
  });

  it('should render dash for consent_submitted_at when null', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    // Bob has null consent_submitted_at
    expect(result).toContain('&mdash;');
  });

  // ─── escapeHtml branches ─────────────────────────────────────────────────────

  it('should escape HTML entities in student names', () => {
    const data = {
      ...FULL_DATA,
      students: [
        {
          ...FULL_DATA.students[0],
          name: '<script>alert("xss")</script>',
        },
      ],
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should handle null/undefined input to escapeHtml gracefully', () => {
    const data = {
      ...FULL_DATA,
      event: {
        ...FULL_DATA.event,
        title: '',
      },
    };
    const result = renderTripLeaderPackEn(data, BRANDING);

    expect(typeof result).toBe('string');
  });

  // ─── Footer ──────────────────────────────────────────────────────────────────

  it('should include generated_at in footer', () => {
    const result = renderTripLeaderPackEn(FULL_DATA, BRANDING);

    expect(result).toContain('2026-03-12 10:30');
    expect(result).toContain('Confidential');
  });
});
