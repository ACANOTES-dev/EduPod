import {
  anonymiseForAI,
  deAnonymiseFromAI,
  DEFAULT_ANONYMISE_OPTIONS,
} from './anonymise';

describe('anonymiseForAI', () => {
  it('should replace student names with sequential tokens Student-A, Student-B', () => {
    const data = {
      students: [
        { first_name: 'John', points: 10 },
        { first_name: 'Jane', points: 20 },
      ],
    };

    const { anonymised, tokenMap } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    const students = anonymised.students as Array<Record<string, unknown>>;
    expect(students[0]!.first_name).toBe('Student-A');
    expect(students[1]!.first_name).toBe('Student-B');
    expect(tokenMap.get('Student-A')).toBe('John');
    expect(tokenMap.get('Student-B')).toBe('Jane');
  });

  it('should replace staff names with role titles when available', () => {
    const data = {
      staff_name: 'Mr Williams',
      reporter_name: 'Mrs Brown',
    };

    const { anonymised, tokenMap } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect(anonymised.staff_name).not.toBe('Mr Williams');
    expect(anonymised.reporter_name).not.toBe('Mrs Brown');
    expect(tokenMap.size).toBeGreaterThan(0);
  });

  it('should remove all UUID values from input', () => {
    const data = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Test',
      student_id: '550e8400-e29b-41d4-a716-446655440000',
    };

    const { anonymised } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect(anonymised.id).toBe('[REDACTED_ID]');
    expect(anonymised.title).toBe('Test');
    expect(anonymised.student_id).toBe('[REDACTED_ID]');
  });

  it('should remove context_notes field', () => {
    const data = {
      title: 'Test incident',
      context_notes: 'Sensitive private notes',
      description: 'Visible description',
    };

    const { anonymised } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect(anonymised).not.toHaveProperty('context_notes');
    expect(anonymised.title).toBe('Test incident');
    expect(anonymised.description).toBe('Visible description');
  });

  it('should remove send_notes and send_aware fields', () => {
    const data = {
      title: 'Test record',
      send_notes: 'Has ADHD diagnosis',
      send_aware: true,
      send_status: 'EHCP',
    };

    const { anonymised } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect(anonymised).not.toHaveProperty('send_notes');
    expect(anonymised).not.toHaveProperty('send_aware');
    expect(anonymised).not.toHaveProperty('send_status');
    expect(anonymised.title).toBe('Test record');
  });

  it('should remove safeguarding-related fields', () => {
    const data = {
      title: 'Test incident',
      safeguarding_flag: true,
      is_safeguarding: true,
      child_protection: 'active',
    };

    const { anonymised } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect(anonymised).not.toHaveProperty('safeguarding_flag');
    expect(anonymised).not.toHaveProperty('is_safeguarding');
    expect(anonymised).not.toHaveProperty('child_protection');
    expect(anonymised.title).toBe('Test incident');
  });

  it('should return tokenMap mapping tokens to original identities', () => {
    const data = {
      first_name: 'Alice',
      staff_name: 'Mr Johnson',
    };

    const { tokenMap } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect(tokenMap.size).toBeGreaterThan(0);
    const values = Array.from(tokenMap.values());
    expect(values).toContain('Alice');
  });

  it('should not mutate the original input object', () => {
    const data = {
      first_name: 'Original',
      context_notes: 'Private',
      id: '123e4567-e89b-12d3-a456-426614174000',
    };

    const original = JSON.parse(JSON.stringify(data));
    anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect(data).toEqual(original);
  });

  it('should handle nested objects recursively', () => {
    const data = {
      incident: {
        student: {
          first_name: 'Bob',
          context_notes: 'Private info',
        },
        description: 'Test',
      },
    };

    const { anonymised } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect((anonymised.incident as Record<string, unknown>).description).toBe('Test');
    const incidentObj = anonymised.incident as Record<string, unknown>;
    const student = incidentObj.student as Record<string, unknown> | undefined;
    expect(student).not.toHaveProperty('context_notes');
    expect(student!.first_name).toBe('Student-A');
  });

  it('should handle arrays recursively', () => {
    const data = {
      incidents: [
        { first_name: 'Alice', context_notes: 'note1' },
        { first_name: 'Bob', context_notes: 'note2' },
      ],
    };

    const { anonymised } = anonymiseForAI(data, DEFAULT_ANONYMISE_OPTIONS);

    expect(anonymised.incidents).toHaveLength(2);
    const items = anonymised.incidents as Array<Record<string, unknown>>;
    expect(items[0]).not.toHaveProperty('context_notes');
    expect(items[1]).not.toHaveProperty('context_notes');
  });
});

describe('deAnonymiseFromAI', () => {
  it('should replace tokens with real identities in response text', () => {
    const tokenMap = new Map([
      ['Student-A', 'John Doe'],
      ['Student-B', 'Jane Smith'],
    ]);

    const response = 'Student-A has shown improvement. Student-B needs attention.';
    const result = deAnonymiseFromAI(response, tokenMap);

    expect(result).toBe('John Doe has shown improvement. Jane Smith needs attention.');
  });

  it('should handle empty tokenMap', () => {
    const tokenMap = new Map<string, string>();
    const response = 'No tokens here.';
    const result = deAnonymiseFromAI(response, tokenMap);

    expect(result).toBe('No tokens here.');
  });

  it('should replace multiple occurrences of the same token', () => {
    const tokenMap = new Map([['Student-A', 'John']]);
    const response = 'Student-A is doing well. Student-A should continue.';
    const result = deAnonymiseFromAI(response, tokenMap);

    expect(result).toBe('John is doing well. John should continue.');
  });
});
