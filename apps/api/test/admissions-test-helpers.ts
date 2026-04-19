import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { authGet, authPost } from './helpers';

interface OptionRow {
  value: string;
  label: string;
}

interface PublicFormField {
  field_key: string;
  options_json?: unknown;
}

interface PublicFormShape {
  id: string;
  fields?: PublicFormField[];
}

type AdmissionsHelperState = typeof globalThis & {
  __admissionsIpCounter?: number;
};

function nextAdmissionsIp(globals: AdmissionsHelperState): string {
  globals.__admissionsIpCounter = (globals.__admissionsIpCounter ?? 0) + 1;
  const subnetOctet = (Math.floor(globals.__admissionsIpCounter / 250) % 250) + 1;
  const hostOctet = (globals.__admissionsIpCounter % 250) + 1;
  return `10.20.${subnetOctet}.${hostOctet}`;
}

export interface AdmissionsTargets {
  formId: string;
  academicYearId: string;
  yearGroupId: string;
}

export interface PublicApplicationSeed {
  mode: 'new_household' | 'existing_household';
  form_definition_id: string;
  household_payload?: {
    parent1_first_name: string;
    parent1_last_name: string;
    parent1_email: string;
    parent1_phone: string;
    parent1_relationship: string;
    address_line_1: string;
    city: string;
    country: string;
  };
  students: Array<{
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: 'male' | 'female';
    national_id: string;
    target_academic_year_id: string;
    target_year_group_id: string;
  }>;
}

function randomSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractOptions(form: PublicFormShape, fieldKey: string): OptionRow[] {
  const field = form.fields?.find((item) => item.field_key === fieldKey);
  if (!field || !Array.isArray(field.options_json)) {
    return [];
  }

  return field.options_json.filter(
    (item): item is OptionRow =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { value?: unknown }).value === 'string' &&
      typeof (item as { label?: unknown }).label === 'string',
  );
}

async function fetchPublicForm(app: INestApplication, host: string): Promise<PublicFormShape> {
  const res = await request(app.getHttpServer())
    .get('/api/v1/public/admissions/form')
    .set('Host', host)
    .expect(200);

  return (res.body.data ?? res.body) as PublicFormShape;
}

export async function ensureAdmissionsTargets(
  app: INestApplication,
  ownerToken: string,
  host: string,
): Promise<AdmissionsTargets> {
  let publicForm = await fetchPublicForm(app, host);

  let academicYearId = extractOptions(publicForm, 'target_academic_year_id')[0]?.value;
  if (!academicYearId) {
    const baseYear = new Date().getUTCFullYear();
    const createYearRes = await authPost(
      app,
      '/api/v1/academic-years',
      ownerToken,
      {
        name: `Admissions Year ${randomSuffix()}`,
        start_date: `${baseYear}-09-01`,
        end_date: `${baseYear + 1}-06-30`,
        status: 'active',
      },
      host,
    ).expect(201);

    academicYearId = (createYearRes.body.data ?? createYearRes.body).id as string;
    publicForm = await fetchPublicForm(app, host);
  }

  let yearGroupId = extractOptions(publicForm, 'target_year_group_id')[0]?.value;
  if (!yearGroupId) {
    const createYearGroupRes = await authPost(
      app,
      '/api/v1/year-groups',
      ownerToken,
      { name: `Admissions Year Group ${randomSuffix()}`, display_order: 500 },
      host,
    ).expect(201);

    yearGroupId = (createYearGroupRes.body.data ?? createYearGroupRes.body).id as string;
    publicForm = await fetchPublicForm(app, host);
  }

  const refreshedAcademicYearId =
    extractOptions(publicForm, 'target_academic_year_id')[0]?.value ?? academicYearId;
  const refreshedYearGroupId =
    extractOptions(publicForm, 'target_year_group_id')[0]?.value ?? yearGroupId;

  return {
    formId: publicForm.id,
    academicYearId: refreshedAcademicYearId,
    yearGroupId: refreshedYearGroupId,
  };
}

export function buildPublicApplicationSeed(targets: AdmissionsTargets): PublicApplicationSeed {
  const suffix = randomSuffix();
  const studentFirstName = `Student-${suffix}`;
  const studentLastName = 'Admissions';
  const dateOfBirth = '2018-05-15';

  return {
    mode: 'new_household',
    form_definition_id: targets.formId,
    household_payload: {
      parent1_first_name: 'Test',
      parent1_last_name: 'Parent',
      parent1_email: `parent-${suffix}@test.local`,
      parent1_phone: '+353871234567',
      parent1_relationship: 'guardian',
      address_line_1: '1 Test Street',
      city: 'Dublin',
      country: 'IE',
    },
    students: [
      {
        first_name: studentFirstName,
        last_name: studentLastName,
        date_of_birth: dateOfBirth,
        gender: 'male',
        national_id: `NID-${suffix}`,
        target_academic_year_id: targets.academicYearId,
        target_year_group_id: targets.yearGroupId,
      },
    ],
  };
}

export async function createPublicApplication(
  app: INestApplication,
  host: string,
  seed: PublicApplicationSeed,
) {
  const globals = globalThis as AdmissionsHelperState;

  const res = await request(app.getHttpServer())
    .post('/api/v1/public/admissions/applications')
    .set('Host', host)
    .set('X-Forwarded-For', nextAdmissionsIp(globals))
    .send(seed)
    .expect(201);

  const fullBody = (res.body.data ?? res.body) as {
    applications?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  const firstApp = (fullBody.applications?.[0] ?? {}) as Record<string, unknown>;

  return {
    response: res,
    body: firstApp,
    fullBody,
  };
}

export async function getAdmissionsDashboardSummary(
  app: INestApplication,
  token: string,
  host: string,
) {
  const res = await authGet(app, '/api/v1/admissions/dashboard-summary', token, host).expect(200);
  const outer = res.body.data ?? res.body;
  return outer.data ?? outer;
}
