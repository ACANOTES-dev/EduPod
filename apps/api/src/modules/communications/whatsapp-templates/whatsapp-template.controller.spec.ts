import { WhatsAppTemplateController } from './whatsapp-template.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEMPLATE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function build() {
  const svc = {
    createTemplate: jest.fn().mockResolvedValue({ id: TEMPLATE_ID }),
    listTemplates: jest
      .fn()
      .mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
    submitToTwilio: jest.fn().mockResolvedValue({ id: TEMPLATE_ID, status: 'submitted' }),
    syncApprovalStatus: jest.fn().mockResolvedValue({ id: TEMPLATE_ID, status: 'approved' }),
    pauseTemplate: jest.fn().mockResolvedValue({ id: TEMPLATE_ID, status: 'paused' }),
    resumeTemplate: jest.fn().mockResolvedValue({ id: TEMPLATE_ID, status: 'approved' }),
    getTemplate: jest.fn().mockResolvedValue({ id: TEMPLATE_ID }),
    deleteTemplate: jest.fn().mockResolvedValue(undefined),
  };
  const ctrl = new WhatsAppTemplateController(svc as never);
  return { ctrl, svc };
}

describe('WhatsAppTemplateController', () => {
  it('POST / delegates createTemplate', async () => {
    const { ctrl, svc } = build();
    const dto = {
      template_key: 'announce',
      language_code: 'en',
      category: 'utility',
      body: 'Hello',
    };
    await ctrl.create({ tenant_id: TENANT_ID } as never, { sub: USER_ID } as never, dto as never);
    expect(svc.createTemplate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('GET / forwards filters + pagination', async () => {
    const { ctrl, svc } = build();
    await ctrl.list(
      { tenant_id: TENANT_ID } as never,
      {
        status: 'approved',
        language_code: 'en',
        template_key: 'announce',
        page: 2,
        pageSize: 50,
      } as never,
    );
    expect(svc.listTemplates).toHaveBeenCalledWith(
      TENANT_ID,
      { status: 'approved', language_code: 'en', template_key: 'announce' },
      2,
      50,
    );
  });

  it('POST /:id/submit', async () => {
    const { ctrl, svc } = build();
    await ctrl.submit({ tenant_id: TENANT_ID } as never, { sub: USER_ID } as never, TEMPLATE_ID);
    expect(svc.submitToTwilio).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID, USER_ID);
  });

  it('POST /:id/sync', async () => {
    const { ctrl, svc } = build();
    await ctrl.sync({ tenant_id: TENANT_ID } as never, TEMPLATE_ID);
    expect(svc.syncApprovalStatus).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID);
  });

  it('POST /:id/pause', async () => {
    const { ctrl, svc } = build();
    await ctrl.pause({ tenant_id: TENANT_ID } as never, { sub: USER_ID } as never, TEMPLATE_ID);
    expect(svc.pauseTemplate).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID, USER_ID);
  });

  it('POST /:id/resume', async () => {
    const { ctrl, svc } = build();
    await ctrl.resume({ tenant_id: TENANT_ID } as never, { sub: USER_ID } as never, TEMPLATE_ID);
    expect(svc.resumeTemplate).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID, USER_ID);
  });

  it('GET /:id', async () => {
    const { ctrl, svc } = build();
    await ctrl.getOne({ tenant_id: TENANT_ID } as never, TEMPLATE_ID);
    expect(svc.getTemplate).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID);
  });

  it('DELETE /:id', async () => {
    const { ctrl, svc } = build();
    await ctrl.remove({ tenant_id: TENANT_ID } as never, { sub: USER_ID } as never, TEMPLATE_ID);
    expect(svc.deleteTemplate).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID, USER_ID);
  });
});
