import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';

const BRANDING: PdfBranding = {
  school_name: 'Test School',
};

describe('renderLegacyLocaleTemplate', () => {
  it('selects the Arabic template for ar', () => {
    const html = renderLegacyLocaleTemplate(
      'ar',
      {
        en: () => '<html lang="en" dir="ltr"><body>INVOICE</body></html>',
        ar: () => '<html lang="ar" dir="rtl"><body>فاتورة</body></html>',
      },
      {},
      BRANDING,
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('فاتورة');
  });

  it('localises the English LTR template for fr', () => {
    const html = renderLegacyLocaleTemplate(
      'fr',
      {
        en: () =>
          '<html lang="en" dir="ltr"><body><h1>INVOICE</h1><p>Bill To</p><p>Status: Partially Paid</p><p>Generated: 29 Apr 2026 &mdash; Confidential</p></body></html>',
        ar: () => '<html lang="ar" dir="rtl"><body>فاتورة</body></html>',
      },
      {},
      BRANDING,
    );

    expect(html).toContain('lang="fr"');
    expect(html).toContain('FACTURE');
    expect(html).toContain('Facturer a');
    expect(html).toContain('Statut : Partiellement paye');
    expect(html).toContain('Genere : 29 avr. 2026 &mdash; Confidentiel');
    expect(html).not.toContain('INVOICE');
    expect(html).not.toContain('Bill To');
  });

  it('localises the English LTR template for es', () => {
    const html = renderLegacyLocaleTemplate(
      'es',
      {
        en: () =>
          '<html lang="en" dir="ltr"><body><h1>INVOICE</h1><p>Bill To</p><p>Status: Partially Paid</p><p>Generated: 29 Apr 2026 &mdash; Confidential</p></body></html>',
        ar: () => '<html lang="ar" dir="rtl"><body>فاتورة</body></html>',
      },
      {},
      BRANDING,
    );

    expect(html).toContain('lang="es"');
    expect(html).toContain('FACTURA');
    expect(html).toContain('Facturar a');
    expect(html).toContain('Estado: Pagado parcialmente');
    expect(html).toContain('Generado: 29 abr 2026 &mdash; Confidencial');
    expect(html).not.toContain('INVOICE');
    expect(html).not.toContain('Bill To');
  });

  it('uses English unchanged for en', () => {
    const html = renderLegacyLocaleTemplate(
      'en',
      {
        en: () => '<html lang="en" dir="ltr"><body>INVOICE</body></html>',
        ar: () => '<html lang="ar" dir="rtl"><body>فاتورة</body></html>',
      },
      {},
      BRANDING,
    );

    expect(html).toContain('lang="en"');
    expect(html).toContain('INVOICE');
  });
});
