import {
  listNotificationCatalogueLocales,
  resolveNotificationTemplateSource,
} from './notification-message-catalogue';

describe('notification message catalogue', () => {
  it('lists shipped notification catalogues', () => {
    expect(listNotificationCatalogueLocales()).toEqual(['ar', 'en', 'es', 'fr']);
  });

  it('returns raw Handlebars templates unchanged', () => {
    expect(resolveNotificationTemplateSource('Hello {{name}}', 'en')).toBe('Hello {{name}}');
  });

  it('resolves t-prefixed English keys', () => {
    expect(resolveNotificationTemplateSource('t:absence_cancelled.email.subject', 'en')).toBe(
      'Absence cancelled',
    );
  });

  it('resolves t-prefixed Arabic keys', () => {
    expect(resolveNotificationTemplateSource('t:absence_cancelled.email.subject', 'ar')).toBe(
      'تم إلغاء الغياب',
    );
  });

  it('resolves t-prefixed French keys', () => {
    expect(resolveNotificationTemplateSource('t:absence_cancelled.email.subject', 'fr')).toBe(
      'Absence annulée',
    );
  });

  it('resolves t-prefixed Spanish keys', () => {
    expect(resolveNotificationTemplateSource('t:absence_cancelled.email.subject', 'es')).toBe(
      'Ausencia cancelada',
    );
  });

  it('throws when the locale catalogue is missing', () => {
    expect(() =>
      resolveNotificationTemplateSource('t:absence_cancelled.email.subject', 'ga'),
    ).toThrow(/MISSING_NOTIFICATION_LOCALE/);
  });

  it('throws when the message key is missing', () => {
    expect(() => resolveNotificationTemplateSource('t:does.not.exist', 'en')).toThrow(
      /MISSING_NOTIFICATION_MESSAGE/,
    );
  });
});
