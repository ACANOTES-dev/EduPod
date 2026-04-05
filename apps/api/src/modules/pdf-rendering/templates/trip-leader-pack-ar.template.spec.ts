import type { PdfBranding } from '../pdf-rendering.service';

import { renderTripLeaderPackAr } from './trip-leader-pack-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const FULL_DATA = {
  event: {
    title: 'Museum Trip',
    title_ar: 'رحلة المتحف',
    start_date: '2026-03-15',
    end_date: '2026-03-15',
    start_time: new Date('2026-03-15T09:00:00'),
    end_time: new Date('2026-03-15T15:00:00'),
    location: 'National Museum',
    location_ar: 'المتحف الوطني',
    risk_assessment_approved: true,
  },
  staff: [
    { id: 'staff-001', role: 'قائد الرحلة' },
    { id: 'staff-002', role: 'مسعف أول' },
  ],
  students: [
    {
      name: 'أحمد',
      year_group: 'السنة 5',
      class_name: '5A',
      date_of_birth: '2015-06-10',
      medical_notes: 'ربو - يحمل جهاز استنشاق',
      has_allergy: true,
      allergy_details: 'حساسية من الفول السوداني',
      emergency_contacts: [
        { contact_name: 'فاطمة', phone: '+971-50-1234567', relationship_label: 'الأم' },
      ],
      consent_status: 'granted',
      consent_submitted_at: '2026-03-10',
    },
    {
      name: 'سارة',
      year_group: 'السنة 5',
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

describe('renderTripLeaderPackAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string with RTL direction', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result).toContain('<html lang="ar" dir="rtl">');
    expect(result).toContain('<!DOCTYPE html>');
  });

  it('should use school_name_ar from branding when available', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should fall back to school_name when school_name_ar is undefined', () => {
    const brandingNoAr: PdfBranding = { school_name: 'English School' };
    const result = renderTripLeaderPackAr(FULL_DATA, brandingNoAr);

    expect(result).toContain('English School');
  });

  it('should use title_ar when available', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('رحلة المتحف');
  });

  it('should fall back to title when title_ar is null', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, title_ar: null },
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain('Museum Trip');
  });

  it('should use location_ar when available', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('المتحف الوطني');
  });

  it('should fall back to location when location_ar is null', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, location_ar: null },
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain('National Museum');
  });

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderTripLeaderPackAr(FULL_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color when branding has none', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderTripLeaderPackAr(FULL_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Event Summary branches ──────────────────────────────────────────────────

  it('should display single date when start equals end', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('2026-03-15');
  });

  it('should display date range when start differs from end', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, end_date: '2026-03-17' },
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain('2026-03-15');
    expect(result).toContain('2026-03-17');
  });

  it('should show time section when start_time exists', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('\u0627\u0644\u0648\u0642\u062A');
  });

  it('should hide time section when both times are null', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, start_time: null, end_time: null },
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    // The time section is conditionally rendered
    const countTimeHeaders = (result.match(/\u0627\u0644\u0648\u0642\u062A<\/p>/g) ?? []).length;
    expect(countTimeHeaders).toBe(0);
  });

  it('should show time with only start_time (no end_time)', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, end_time: null },
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain('\u0627\u0644\u0648\u0642\u062A');
  });

  it('should show approved risk badge', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('\u0645\u0639\u062A\u0645\u062F');
  });

  it('should show not-approved risk badge', () => {
    const data = {
      ...FULL_DATA,
      event: { ...FULL_DATA.event, risk_assessment_approved: false },
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain('\u063A\u064A\u0631 \u0645\u0639\u062A\u0645\u062F');
  });

  // ─── Staff / Students / Medical / Emergency / Consent branches ───────────────

  it('should render staff table when staff exist', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('staff-001');
    expect(result).toContain('قائد الرحلة');
  });

  it('should show empty staff message when no staff', () => {
    const data = { ...FULL_DATA, staff: [] };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain(
      '\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0648\u0638\u0641\u0648\u0646',
    );
  });

  it('should render student roster', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('أحمد');
    expect(result).toContain('السنة 5');
  });

  it('should show empty students message', () => {
    const data = { ...FULL_DATA, students: [] };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain('\u0644\u0627 \u064A\u0648\u062C\u062F \u0637\u0644\u0627\u0628');
  });

  it('should render medical info with allergy details', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('حساسية من الفول السوداني');
  });

  it('should show "لا يوجد" for student without allergies in medical section', () => {
    const data = {
      ...FULL_DATA,
      students: [
        {
          ...FULL_DATA.students[0],
          has_allergy: false,
          allergy_details: null,
          medical_notes: 'Something',
        },
      ],
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain('\u0644\u0627 \u064A\u0648\u062C\u062F');
  });

  it('should show no medical info message when no medical students', () => {
    const data = {
      ...FULL_DATA,
      students: [{ ...FULL_DATA.students[1] }],
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain(
      '\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0637\u0628\u064A\u0629',
    );
  });

  it('should render emergency contacts', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('فاطمة');
    expect(result).toContain('+971-50-1234567');
  });

  it('should show no contacts message when none exist', () => {
    const data = {
      ...FULL_DATA,
      students: [{ ...FULL_DATA.students[1] }],
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).toContain(
      '\u0644\u0627 \u062A\u0648\u062C\u062F \u062C\u0647\u0627\u062A \u0627\u062A\u0635\u0627\u0644',
    );
  });

  it('should render granted consent badge in Arabic', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('\u0645\u0645\u0646\u0648\u062D\u0629');
  });

  it('should render pending consent badge in Arabic', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631');
  });

  it('should render consent submitted date and dash for null', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('2026-03-10');
    expect(result).toContain('&mdash;');
  });

  // ─── escapeHtml branches ─────────────────────────────────────────────────────

  it('should escape HTML entities', () => {
    const data = {
      ...FULL_DATA,
      students: [
        {
          ...FULL_DATA.students[0],
          name: '<script>alert("xss")</script>',
        },
      ],
    };
    const result = renderTripLeaderPackAr(data, BRANDING);

    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should include generated_at in footer', () => {
    const result = renderTripLeaderPackAr(FULL_DATA, BRANDING);

    expect(result).toContain('2026-03-12 10:30');
  });
});
