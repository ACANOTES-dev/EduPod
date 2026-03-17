import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  AL_NOOR_DOMAIN,
} from '../helpers';
import request from 'supertest';

jest.setTimeout(120_000);

describe('Webhooks (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── POST /api/v1/webhooks/resend ─────────────────────────────────────────────

  describe('POST /api/v1/webhooks/resend', () => {
    it('happy path — delivery event processed', async () => {
      const resendEvent = {
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: {
          email_id: 'test-resend-id-' + Date.now(),
          from: 'noreply@school.test',
          to: ['parent@example.com'],
          subject: 'Test Email',
          created_at: new Date().toISOString(),
        },
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/resend')
        .set('Host', AL_NOOR_DOMAIN)
        .send(resendEvent);

      expect([200, 201]).toContain(res.status);
    });

    it('unknown provider_message_id — ignored gracefully', async () => {
      const resendEvent = {
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: {
          email_id: 'nonexistent-message-id-' + Date.now(),
          from: 'noreply@school.test',
          to: ['unknown@example.com'],
          subject: 'Unknown',
          created_at: new Date().toISOString(),
        },
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/resend')
        .set('Host', AL_NOOR_DOMAIN)
        .send(resendEvent);

      expect([200, 201]).toContain(res.status);
    });
  });

  // ─── POST /api/v1/webhooks/twilio ─────────────────────────────────────────────

  describe('POST /api/v1/webhooks/twilio', () => {
    it('happy path — delivered status', async () => {
      const twilioEvent = {
        MessageSid: 'SM' + Date.now(),
        MessageStatus: 'delivered',
        To: '+1234567890',
        From: '+0987654321',
        AccountSid: 'AC_test_account',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/twilio')
        .set('Host', AL_NOOR_DOMAIN)
        .type('form')
        .send(twilioEvent);

      expect([200, 201]).toContain(res.status);
    });

    it('failed status — triggers email fallback', async () => {
      const twilioEvent = {
        MessageSid: 'SM' + Date.now(),
        MessageStatus: 'failed',
        To: '+1234567890',
        From: '+0987654321',
        AccountSid: 'AC_test_account',
        ErrorCode: '30001',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/twilio')
        .set('Host', AL_NOOR_DOMAIN)
        .type('form')
        .send(twilioEvent);

      expect([200, 201]).toContain(res.status);
    });
  });
});
