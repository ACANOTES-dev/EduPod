/**
 * Architecture invariants for the communication credential controllers.
 *
 * These invariants exist because the decrypted credential reader
 * (`getDecryptedConfig`) MUST stay service-internal. Wave 4's dispatch
 * provider refactor (Impl 04) is the only consumer; controllers must NEVER
 * route plaintext credentials to clients.
 *
 * If this test fails after a future PR, the offending controller is
 * exposing the internal reader and the change is a security regression.
 */
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('Communication credential controllers — architecture invariants', () => {
  const controllerFiles = [
    'email-config.controller.ts',
    'sms-config.controller.ts',
    'whatsapp-config.controller.ts',
  ];

  it.each(controllerFiles)(
    '%s never references getDecryptedConfig (must stay service-internal)',
    async (file) => {
      const path = resolve(__dirname, file);
      const contents = await fs.readFile(path, 'utf8');
      expect(contents).not.toMatch(/getDecryptedConfig/);
    },
  );

  it.each(controllerFiles)(
    '%s never references "Decrypted*Config" types (must stay service-internal)',
    async (file) => {
      const path = resolve(__dirname, file);
      const contents = await fs.readFile(path, 'utf8');
      expect(contents).not.toMatch(/Decrypted(Email|Sms|WhatsApp)Config/);
    },
  );
});
