import { Test } from '@nestjs/testing';

import { NotificationsService } from '../../communications/notifications.service';

import { WellbeingInAppProvider } from './in-app.provider';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('WellbeingInAppProvider', () => {
  let provider: WellbeingInAppProvider;
  let notifications: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    notifications = {
      createBatch: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;

    const module = await Test.createTestingModule({
      providers: [
        WellbeingInAppProvider,
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    provider = module.get(WellbeingInAppProvider);
  });

  afterEach(() => jest.clearAllMocks());

  it('writes one in_app notification per recipient', async () => {
    notifications.createBatch.mockResolvedValue(undefined);

    await provider.send({
      tenantId: TENANT_ID,
      event: 'incident.logged',
      recipients: [{ user_id: USER_A, email: 'a@example.com' }, { user_id: USER_B }],
      title: 'Incident logged',
      body: 'Disruption reported.',
      href: '/behaviour/incidents/x',
      severity: 'warning',
      source_entity_type: 'behaviour_incident',
      source_entity_id: 'x',
    });

    expect(notifications.createBatch).toHaveBeenCalledTimes(1);
    const call = notifications.createBatch.mock.calls[0]!;
    const tenantArg = call[0];
    const batchArg = call[1];
    expect(tenantArg).toBe(TENANT_ID);
    expect(batchArg).toHaveLength(2);
    expect(batchArg[0]).toMatchObject({
      tenant_id: TENANT_ID,
      recipient_user_id: USER_A,
      channel: 'in_app',
      template_key: 'wellbeing.incident.logged',
      locale: 'en',
      payload_json: {
        event: 'incident.logged',
        severity: 'warning',
        title: 'Incident logged',
        body: 'Disruption reported.',
        href: '/behaviour/incidents/x',
      },
      source_entity_type: 'behaviour_incident',
      source_entity_id: 'x',
    });
  });

  it('skips the createBatch call when there are no recipients', async () => {
    await provider.send({
      tenantId: TENANT_ID,
      event: 'sla.breach',
      recipients: [],
      title: 't',
      body: 'b',
      severity: 'info',
    });

    expect(notifications.createBatch).not.toHaveBeenCalled();
  });

  it('honours the requested locale', async () => {
    notifications.createBatch.mockResolvedValue(undefined);

    await provider.send({
      tenantId: TENANT_ID,
      event: 'concern.raised',
      recipients: [{ user_id: USER_A }],
      title: 'كذا',
      body: 'كذا',
      severity: 'critical',
      locale: 'ar',
    });

    const batchArg = notifications.createBatch.mock.calls[0]![1];
    expect(batchArg[0]!.locale).toBe('ar');
  });
});
