import type { SubjectDescriptor } from '../../subject-registry/types';

import { buildCatalogue, buildPrompt, renderCatalogueBlock } from './build-prompt';

const SUBJECT: SubjectDescriptor = {
  key: 'student',
  label_key: 'reports.subjects.student',
  icon_name: 'GraduationCap',
  primary_model: 'Student',
  fields: [
    {
      id: 'student.identity.first_name',
      label_key: 'reports.fields.student.first_name',
      domain: 'identity',
      type: 'string',
      filterable: true,
      groupable: false,
      resolver: 'identity.first_name',
    },
    {
      id: 'student.identity.gender',
      label_key: 'reports.fields.student.gender',
      domain: 'identity',
      type: 'enum',
      filterable: true,
      groupable: true,
      enum_values: ['male', 'female', 'unspecified'],
      resolver: 'identity.gender',
    },
  ],
};

describe('build-prompt', () => {
  it('builds a compact catalogue without label_key, icon_name, resolver, primary_model', () => {
    const compact = buildCatalogue([SUBJECT]);
    expect(compact).toHaveLength(1);
    expect(compact[0]).toEqual({
      key: 'student',
      fields: [
        {
          id: 'student.identity.first_name',
          type: 'string',
          filterable: true,
          groupable: false,
        },
        {
          id: 'student.identity.gender',
          type: 'enum',
          filterable: true,
          groupable: true,
          enum_values: ['male', 'female', 'unspecified'],
        },
      ],
    });
  });

  it('renderCatalogueBlock returns valid JSON', () => {
    const block = renderCatalogueBlock([SUBJECT]);
    expect(() => JSON.parse(block)).not.toThrow();
  });

  it('buildPrompt includes the user question and references the catalogue', () => {
    const { systemPrompt, userPrompt } = buildPrompt([SUBJECT], 'How many Year 10 students?');
    expect(userPrompt).toContain('How many Year 10 students?');
    expect(systemPrompt).toContain('"key":"student"');
    expect(systemPrompt).toContain('CATALOGUE');
    expect(systemPrompt).toContain('EXAMPLES');
  });
});
