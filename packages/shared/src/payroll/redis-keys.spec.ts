import {
  buildMassExportPdfKey,
  buildMassExportStatusKey,
  buildSessionGenStatusKey,
  MASS_EXPORT_PDF_TTL_SECONDS,
  MASS_EXPORT_STATUS_TTL_SECONDS,
  SESSION_GEN_STATUS_TTL_SECONDS,
} from './redis-keys';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';
const TENANT_B = '00000000-0000-0000-0000-00000000000b';
const RUN_1 = '11111111-1111-1111-1111-111111111111';
const RUN_2 = '22222222-2222-2222-2222-222222222222';

describe('redis-keys — payroll', () => {
  describe('buildSessionGenStatusKey', () => {
    it('includes both tenant and run id segments', () => {
      const key = buildSessionGenStatusKey(TENANT_A, RUN_1);
      expect(key).toContain(TENANT_A);
      expect(key).toContain(RUN_1);
      expect(key.startsWith('payroll:session-gen:')).toBe(true);
    });

    it('produces distinct keys for different tenants on the same run id', () => {
      expect(buildSessionGenStatusKey(TENANT_A, RUN_1)).not.toBe(
        buildSessionGenStatusKey(TENANT_B, RUN_1),
      );
    });

    it('produces distinct keys for different runs in the same tenant', () => {
      expect(buildSessionGenStatusKey(TENANT_A, RUN_1)).not.toBe(
        buildSessionGenStatusKey(TENANT_A, RUN_2),
      );
    });
  });

  describe('buildMassExportStatusKey / buildMassExportPdfKey', () => {
    it('namespaces status and pdf keys distinctly even for the same (tenant, run)', () => {
      expect(buildMassExportStatusKey(TENANT_A, RUN_1)).not.toBe(
        buildMassExportPdfKey(TENANT_A, RUN_1),
      );
    });

    it('status key ends with :status', () => {
      expect(buildMassExportStatusKey(TENANT_A, RUN_1).endsWith(':status')).toBe(true);
    });

    it('pdf key ends with :pdf', () => {
      expect(buildMassExportPdfKey(TENANT_A, RUN_1).endsWith(':pdf')).toBe(true);
    });
  });

  it('exposes the TTL constants both readers and writers consume', () => {
    expect(SESSION_GEN_STATUS_TTL_SECONDS).toBeGreaterThan(0);
    expect(MASS_EXPORT_STATUS_TTL_SECONDS).toBeGreaterThan(0);
    expect(MASS_EXPORT_PDF_TTL_SECONDS).toBeGreaterThan(MASS_EXPORT_STATUS_TTL_SECONDS);
  });
});
