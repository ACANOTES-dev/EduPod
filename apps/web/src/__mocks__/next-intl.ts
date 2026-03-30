// Stub for next-intl — returns the translation key as-is so tests can assert on keys
export const useTranslations = jest.fn(() => (key: string) => key);
export const getTranslations = jest.fn(() => Promise.resolve((key: string) => key));
