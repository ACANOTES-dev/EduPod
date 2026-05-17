import { Test, TestingModule } from '@nestjs/testing';

import type {
  CreatePlatformIncidentTimelineEventDto,
  JwtPayload,
  ListPlatformIncidentsQuery,
  SavePlatformIncidentPostmortemDto,
  UpdatePlatformIncidentDto,
} from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { PlatformIncidentService } from './platform-incident.service';
import { PlatformIncidentsController } from './platform-incidents.controller';
import { PostmortemGeneratorService } from './postmortem-generator.service';

const INCIDENT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'owner@example.com',
  tenant_id: null,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 0,
};

function buildIncidentService() {
  return {
    addOperatorNote: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
    get: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
    list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
    saveFinalPostmortem: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
    update: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
  };
}

function buildPostmortemService() {
  return {
    generate: jest.fn().mockResolvedValue({ id: INCIDENT_ID, postmortem_draft: '## Draft' }),
    generatePreventionRecommendations: jest.fn().mockResolvedValue({ created: 1 }),
  };
}

describe('PlatformIncidentsController', () => {
  let controller: PlatformIncidentsController;
  let incidents: ReturnType<typeof buildIncidentService>;
  let postmortems: ReturnType<typeof buildPostmortemService>;

  beforeEach(async () => {
    incidents = buildIncidentService();
    postmortems = buildPostmortemService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformIncidentsController],
      providers: [
        { provide: PlatformIncidentService, useValue: incidents },
        { provide: PostmortemGeneratorService, useValue: postmortems },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PlatformIncidentsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates incident listing with filters', async () => {
    const query: ListPlatformIncidentsQuery = {
      page: 1,
      pageSize: 20,
      severity: 'critical',
      status: 'active',
    };

    await controller.list(query);

    expect(incidents.list).toHaveBeenCalledWith(query);
  });

  it('delegates incident detail lookup', async () => {
    await controller.get(INCIDENT_ID);

    expect(incidents.get).toHaveBeenCalledWith(INCIDENT_ID);
  });

  it('delegates incident updates with the acting user id', async () => {
    const dto: UpdatePlatformIncidentDto = {
      status: 'monitoring',
      title: 'Redis recovery monitoring',
    };

    await controller.update(INCIDENT_ID, dto, mockUser);

    expect(incidents.update).toHaveBeenCalledWith(INCIDENT_ID, dto, USER_ID);
  });

  it('delegates operator postmortem saves without regenerating the draft', async () => {
    const dto: SavePlatformIncidentPostmortemDto = {
      postmortem_final: '## Final\n\nOperator-approved final postmortem. [E:1]',
    };

    await controller.savePostmortem(INCIDENT_ID, dto);

    expect(incidents.saveFinalPostmortem).toHaveBeenCalledWith(INCIDENT_ID, dto.postmortem_final);
    expect(postmortems.generate).not.toHaveBeenCalled();
  });

  it('delegates manual postmortem generation with the acting user id', async () => {
    await controller.regeneratePostmortem(INCIDENT_ID, mockUser);

    expect(postmortems.generate).toHaveBeenCalledWith(INCIDENT_ID, USER_ID);
  });

  it('delegates operator timeline notes', async () => {
    const dto: CreatePlatformIncidentTimelineEventDto = {
      description: 'Confirmed Redis recovery from platform metrics.',
    };

    await controller.addTimelineEvent(INCIDENT_ID, dto);

    expect(incidents.addOperatorNote).toHaveBeenCalledWith(INCIDENT_ID, dto);
  });

  it('delegates prevention recommendation generation with the acting user id', async () => {
    await controller.generatePrevention(INCIDENT_ID, mockUser);

    expect(postmortems.generatePreventionRecommendations).toHaveBeenCalledWith(
      INCIDENT_ID,
      USER_ID,
    );
  });
});
