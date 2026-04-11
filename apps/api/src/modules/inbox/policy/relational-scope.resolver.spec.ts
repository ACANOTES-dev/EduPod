import { Test, TestingModule } from '@nestjs/testing';

import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { ParentReadFacade } from '../../parents/parent-read.facade';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../../students/student-read.facade';

import { RelationalScopeResolver } from './relational-scope.resolver';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEACHER_USER_ID = 'teacher-user';
const PARENT_USER_ID = 'parent-user';
const OTHER_PARENT_USER_ID = 'other-parent-user';
const OTHER_TEACHER_USER_ID = 'other-teacher-user';

describe('RelationalScopeResolver — admin / short-circuit branches', () => {
  let resolver: RelationalScopeResolver;
  let classes: {
    findClassIdsByStaff: jest.Mock;
    findEnrolledStudentIds: jest.Mock;
    findClassIdsByStudentIds: jest.Mock;
    findStaffProfileIdsByClassIds: jest.Mock;
  };
  let parents: {
    findByUserId: jest.Mock;
    findByIds: jest.Mock;
    findLinkedStudentIds: jest.Mock;
  };
  let students: {
    findParentIdsByStudentIds: jest.Mock;
  };
  let staff: { findByUserId: jest.Mock; findByIds: jest.Mock };

  beforeEach(async () => {
    classes = {
      findClassIdsByStaff: jest.fn(),
      findEnrolledStudentIds: jest.fn(),
      findClassIdsByStudentIds: jest.fn(),
      findStaffProfileIdsByClassIds: jest.fn(),
    };
    parents = {
      findByUserId: jest.fn(),
      findByIds: jest.fn(),
      findLinkedStudentIds: jest.fn(),
    };
    students = { findParentIdsByStudentIds: jest.fn() };
    staff = { findByUserId: jest.fn(), findByIds: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationalScopeResolver,
        { provide: ClassesReadFacade, useValue: classes },
        { provide: ParentReadFacade, useValue: parents },
        { provide: StudentReadFacade, useValue: students },
        { provide: StaffProfileReadFacade, useValue: staff },
      ],
    }).compile();

    resolver = module.get(RelationalScopeResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('admin tier sender reaches any recipient without a DB call', async () => {
    const result = await resolver.canReachBatch(
      'owner-u',
      [PARENT_USER_ID, OTHER_PARENT_USER_ID],
      'owner',
      'parent',
      TENANT_ID,
    );
    expect(result.reachable.size).toBe(2);
    expect(result.unreachable.size).toBe(0);
    expect(classes.findClassIdsByStaff).not.toHaveBeenCalled();
  });

  it('office → parent reaches without DB', async () => {
    const result = await resolver.canReachBatch(
      'office-u',
      [PARENT_USER_ID],
      'office',
      'parent',
      TENANT_ID,
    );
    expect(result.reachable.has(PARENT_USER_ID)).toBe(true);
    expect(staff.findByUserId).not.toHaveBeenCalled();
  });

  it('teacher → teacher always reachable', async () => {
    const result = await resolver.canReachBatch(
      TEACHER_USER_ID,
      [OTHER_TEACHER_USER_ID],
      'teacher',
      'teacher',
      TENANT_ID,
    );
    expect(result.reachable.has(OTHER_TEACHER_USER_ID)).toBe(true);
  });

  it('parent → admin tier always reachable', async () => {
    const result = await resolver.canReachBatch(
      PARENT_USER_ID,
      ['principal-u'],
      'parent',
      'principal',
      TENANT_ID,
    );
    expect(result.reachable.has('principal-u')).toBe(true);
  });
});

describe('RelationalScopeResolver — teacher → parent scope', () => {
  let resolver: RelationalScopeResolver;
  let classes: {
    findClassIdsByStaff: jest.Mock;
    findEnrolledStudentIds: jest.Mock;
    findClassIdsByStudentIds: jest.Mock;
    findStaffProfileIdsByClassIds: jest.Mock;
  };
  let parents: {
    findByUserId: jest.Mock;
    findByIds: jest.Mock;
    findLinkedStudentIds: jest.Mock;
  };
  let students: { findParentIdsByStudentIds: jest.Mock };
  let staff: { findByUserId: jest.Mock; findByIds: jest.Mock };

  beforeEach(async () => {
    classes = {
      findClassIdsByStaff: jest.fn(),
      findEnrolledStudentIds: jest.fn(),
      findClassIdsByStudentIds: jest.fn(),
      findStaffProfileIdsByClassIds: jest.fn(),
    };
    parents = {
      findByUserId: jest.fn(),
      findByIds: jest.fn(),
      findLinkedStudentIds: jest.fn(),
    };
    students = { findParentIdsByStudentIds: jest.fn() };
    staff = { findByUserId: jest.fn(), findByIds: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationalScopeResolver,
        { provide: ClassesReadFacade, useValue: classes },
        { provide: ParentReadFacade, useValue: parents },
        { provide: StudentReadFacade, useValue: students },
        { provide: StaffProfileReadFacade, useValue: staff },
      ],
    }).compile();

    resolver = module.get(RelationalScopeResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('reaches parents of students in the teacher own classes', async () => {
    staff.findByUserId.mockResolvedValue({ id: 'staff-1', user_id: TEACHER_USER_ID });
    classes.findClassIdsByStaff.mockResolvedValue(['class-1']);
    classes.findEnrolledStudentIds.mockResolvedValue(['student-1']);
    students.findParentIdsByStudentIds.mockResolvedValue(['parent-1']);
    parents.findByIds.mockResolvedValue([{ id: 'parent-1', user_id: PARENT_USER_ID }]);

    const result = await resolver.canReachBatch(
      TEACHER_USER_ID,
      [PARENT_USER_ID, OTHER_PARENT_USER_ID],
      'teacher',
      'parent',
      TENANT_ID,
    );
    expect(result.reachable.has(PARENT_USER_ID)).toBe(true);
    expect(result.unreachable.has(OTHER_PARENT_USER_ID)).toBe(true);
  });

  it('returns empty when the teacher has no staff profile', async () => {
    staff.findByUserId.mockResolvedValue(null);
    const result = await resolver.canReachBatch(
      TEACHER_USER_ID,
      [PARENT_USER_ID],
      'teacher',
      'parent',
      TENANT_ID,
    );
    expect(result.unreachable.has(PARENT_USER_ID)).toBe(true);
    expect(result.reachable.size).toBe(0);
  });
});

describe('RelationalScopeResolver — parent → teacher scope', () => {
  let resolver: RelationalScopeResolver;
  let classes: {
    findClassIdsByStaff: jest.Mock;
    findEnrolledStudentIds: jest.Mock;
    findClassIdsByStudentIds: jest.Mock;
    findStaffProfileIdsByClassIds: jest.Mock;
  };
  let parents: {
    findByUserId: jest.Mock;
    findByIds: jest.Mock;
    findLinkedStudentIds: jest.Mock;
  };
  let students: { findParentIdsByStudentIds: jest.Mock };
  let staff: { findByUserId: jest.Mock; findByIds: jest.Mock };

  beforeEach(async () => {
    classes = {
      findClassIdsByStaff: jest.fn(),
      findEnrolledStudentIds: jest.fn(),
      findClassIdsByStudentIds: jest.fn(),
      findStaffProfileIdsByClassIds: jest.fn(),
    };
    parents = {
      findByUserId: jest.fn(),
      findByIds: jest.fn(),
      findLinkedStudentIds: jest.fn(),
    };
    students = { findParentIdsByStudentIds: jest.fn() };
    staff = { findByUserId: jest.fn(), findByIds: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationalScopeResolver,
        { provide: ClassesReadFacade, useValue: classes },
        { provide: ParentReadFacade, useValue: parents },
        { provide: StudentReadFacade, useValue: students },
        { provide: StaffProfileReadFacade, useValue: staff },
      ],
    }).compile();

    resolver = module.get(RelationalScopeResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('reaches teachers of the parent own children classes', async () => {
    parents.findByUserId.mockResolvedValue({ id: 'parent-1', user_id: PARENT_USER_ID });
    parents.findLinkedStudentIds.mockResolvedValue(['student-1']);
    classes.findClassIdsByStudentIds.mockResolvedValue(['class-1']);
    classes.findStaffProfileIdsByClassIds.mockResolvedValue(['staff-1']);
    staff.findByIds.mockResolvedValue([{ id: 'staff-1', user_id: TEACHER_USER_ID }]);

    const result = await resolver.canReachBatch(
      PARENT_USER_ID,
      [TEACHER_USER_ID, OTHER_TEACHER_USER_ID],
      'parent',
      'teacher',
      TENANT_ID,
    );
    expect(result.reachable.has(TEACHER_USER_ID)).toBe(true);
    expect(result.unreachable.has(OTHER_TEACHER_USER_ID)).toBe(true);
  });

  it('returns empty when the parent has no linked students', async () => {
    parents.findByUserId.mockResolvedValue({ id: 'parent-1', user_id: PARENT_USER_ID });
    parents.findLinkedStudentIds.mockResolvedValue([]);
    const result = await resolver.canReachBatch(
      PARENT_USER_ID,
      [TEACHER_USER_ID],
      'parent',
      'teacher',
      TENANT_ID,
    );
    expect(result.unreachable.has(TEACHER_USER_ID)).toBe(true);
  });
});

describe('RelationalScopeResolver — cache reuse', () => {
  let resolver: RelationalScopeResolver;
  let staff: { findByUserId: jest.Mock; findByIds: jest.Mock };

  beforeEach(async () => {
    staff = { findByUserId: jest.fn(), findByIds: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationalScopeResolver,
        {
          provide: ClassesReadFacade,
          useValue: {
            findClassIdsByStaff: jest.fn().mockResolvedValue([]),
            findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
            findClassIdsByStudentIds: jest.fn().mockResolvedValue([]),
            findStaffProfileIdsByClassIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ParentReadFacade,
          useValue: {
            findByUserId: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
            findLinkedStudentIds: jest.fn(),
          },
        },
        {
          provide: StudentReadFacade,
          useValue: { findParentIdsByStudentIds: jest.fn().mockResolvedValue([]) },
        },
        { provide: StaffProfileReadFacade, useValue: staff },
      ],
    }).compile();
    resolver = module.get(RelationalScopeResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('short-circuits cached entries without re-running the DB path', async () => {
    const cache = new Map<string, boolean>();
    cache.set(`t-1:${PARENT_USER_ID}:teacher:parent`, true);
    const result = await resolver.canReachBatch(
      't-1',
      [PARENT_USER_ID],
      'teacher',
      'parent',
      TENANT_ID,
      cache,
    );
    expect(result.reachable.has(PARENT_USER_ID)).toBe(true);
    expect(staff.findByUserId).not.toHaveBeenCalled();
  });
});
