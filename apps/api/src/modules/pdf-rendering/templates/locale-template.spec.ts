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

  it('localises the English LTR template for de', () => {
    const html = renderLegacyLocaleTemplate(
      'de',
      {
        en: () =>
          '<html lang="en" dir="ltr"><body><h1>INVOICE</h1><p>Bill To</p><p>Status: Partially Paid</p><p>Generated: 29 Apr 2026 &mdash; Confidential</p></body></html>',
        ar: () => '<html lang="ar" dir="rtl"><body>فاتورة</body></html>',
      },
      {},
      BRANDING,
    );

    expect(html).toContain('lang="de"');
    expect(html).toContain('RECHNUNG');
    expect(html).toContain('Rechnung an');
    expect(html).toContain('Status: Teilweise bezahlt');
    expect(html).toContain('Erstellt: 29 Apr. 2026 &mdash; Vertraulich');
    expect(html).not.toContain('INVOICE');
    expect(html).not.toContain('Bill To');
  });

  it('localises the English LTR template for ga', () => {
    const html = renderLegacyLocaleTemplate(
      'ga',
      {
        en: () =>
          '<html lang="en" dir="ltr"><body><h1>INVOICE</h1><p>Bill To</p><p>Status: Partially Paid</p><p>Generated: 29 Apr 2026 &mdash; Confidential</p></body></html>',
        ar: () => '<html lang="ar" dir="rtl"><body>فاتورة</body></html>',
      },
      {},
      BRANDING,
    );

    expect(html).toContain('lang="ga"');
    expect(html).toContain('SONRASC');
    expect(html).toContain('Bille chuig');
    expect(html).toContain('Stádas: Íoctha go páirteach');
    expect(html).toContain('Ginte: 29 Aib. 2026 &mdash; Rúnda');
    expect(html).not.toContain('INVOICE');
    expect(html).not.toContain('Bill To');
  });

  it('localises the English LTR template for it', () => {
    const html = renderLegacyLocaleTemplate(
      'it',
      {
        en: () =>
          '<html lang="en" dir="ltr"><body><h1>INVOICE</h1><p>Bill To</p><p>Status: Partially Paid</p><p>Generated: 29 Apr 2026 &mdash; Confidential</p></body></html>',
        ar: () => '<html lang="ar" dir="rtl"><body>فاتورة</body></html>',
      },
      {},
      BRANDING,
    );

    expect(html).toContain('lang="it"');
    expect(html).toContain('FATTURA');
    expect(html).toContain('Intestare a');
    expect(html).toContain('Stato: Parzialmente pagato');
    expect(html).toContain('Generato: 29 apr 2026 &mdash; Riservato');
    expect(html).not.toContain('INVOICE');
    expect(html).not.toContain('Bill To');
  });

  it('localises the English LTR template for ro', () => {
    const html = renderLegacyLocaleTemplate(
      'ro',
      {
        en: () =>
          '<html lang="en" dir="ltr"><body><h1>INVOICE</h1><p>Bill To</p><p>Status: Partially Paid</p><p>Generated: 29 Apr 2026 &mdash; Confidential</p></body></html>',
        ar: () => '<html lang="ar" dir="rtl"><body>فاتورة</body></html>',
      },
      {},
      BRANDING,
    );

    expect(html).toContain('lang="ro"');
    expect(html).toContain('FACTURĂ');
    expect(html).toContain('Facturat către');
    expect(html).toContain('Stare: Plătit parțial');
    expect(html).toContain('Generat: 29 apr 2026 &mdash; Confidențial');
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
