import { reportCardContentScopeSchema } from '../content-scope.schema';
import { preferredSecondLanguageSchema } from '../second-language.schema';

describe('reportCardContentScopeSchema', () => {
  it('accepts grades_only', () => {
    expect(reportCardContentScopeSchema.safeParse('grades_only').success).toBe(true);
  });

  it('rejects future scopes that are not yet enabled', () => {
    expect(reportCardContentScopeSchema.safeParse('grades_homework').success).toBe(false);
    expect(reportCardContentScopeSchema.safeParse('full_master').success).toBe(false);
  });
});

describe('preferredSecondLanguageSchema', () => {
  it('accepts ar', () => {
    expect(preferredSecondLanguageSchema.safeParse('ar').success).toBe(true);
  });

  it('rejects languages that are not yet supported in v1', () => {
    expect(preferredSecondLanguageSchema.safeParse('fr').success).toBe(false);
    expect(preferredSecondLanguageSchema.safeParse('en').success).toBe(false);
  });
});
