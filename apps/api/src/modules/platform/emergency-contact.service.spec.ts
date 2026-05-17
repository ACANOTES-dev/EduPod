import { NotFoundException } from '@nestjs/common';

import { EmergencyContactService } from './emergency-contact.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLATFORM_USER_ID = '22222222-2222-4222-8222-222222222222';
const CONTACT_ID = '33333333-3333-4333-8333-333333333333';

describe('EmergencyContactService', () => {
  it('reads and upserts the current operator emergency contact with audit', async () => {
    const contact = {
      email: 'ops@example.test',
      id: CONTACT_ID,
      platform_user_id: PLATFORM_USER_ID,
      preferred_order: ['email'],
      timezone: 'Europe/Dublin',
    };
    const prisma = {
      platformAlertEmergencyContact: {
        findUnique: jest.fn().mockResolvedValueOnce(contact).mockResolvedValueOnce(null),
        upsert: jest.fn().mockResolvedValue(contact),
      },
      platformUser: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ emergency_contact_id: CONTACT_ID, id: PLATFORM_USER_ID })
          .mockResolvedValueOnce({ emergency_contact_id: null, id: PLATFORM_USER_ID }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new EmergencyContactService(prisma as never, audit as never);

    await expect(service.getMe(USER_ID)).resolves.toEqual(contact);
    await expect(
      service.updateMe(
        USER_ID,
        {
          email: 'ops@example.test',
          preferred_order: ['email'],
          push_subscription: { endpoint: 'https://push.example.test' },
          sms_phone: '+3531000000',
          telegram_chat_id: 'chat-1',
          timezone: 'Europe/Dublin',
          whatsapp_phone: '+3531000001',
        },
        {
          actor_user_id: USER_ID,
          actor_user_role: 'platform_owner',
          request_id: 'req-1',
        },
      ),
    ).resolves.toEqual(contact);

    expect(prisma.platformAlertEmergencyContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          platform_user_id: PLATFORM_USER_ID,
          push_subscription: { endpoint: 'https://push.example.test' },
        }),
        where: { platform_user_id: PLATFORM_USER_ID },
      }),
    );
    expect(prisma.platformUser.update).toHaveBeenCalledWith({
      data: { emergency_contact_id: CONTACT_ID },
      where: { id: PLATFORM_USER_ID },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alert_emergency_contact_updated',
        target_resource_id: CONTACT_ID,
      }),
    );
  });

  it('throws when the signed-in user is not a platform operator', async () => {
    const service = new EmergencyContactService(
      {
        platformUser: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      { log: jest.fn() } as never,
    );

    await expect(service.getMe(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
