import {
  isLocale,
  localize,
  localizeNullable,
  resolveLocale,
} from '../../src/common/utils/localized-string';
import {
  MessageTemplates,
  renderAllLocales,
  renderTemplate,
} from '../../src/common/utils/message-templates';
import {
  buildPagination,
  buildPaginationMeta,
} from '../../src/common/utils/pagination.util';

describe('common utilities', () => {
  describe('localized strings', () => {
    it('resolves supported locales and falls back to English', () => {
      expect(isLocale('am')).toBe(true);
      expect(isLocale('fr')).toBe(false);
      expect(resolveLocale('am')).toBe('am');
      expect(resolveLocale('fr')).toBe('en');
    });

    it('localizes strings, localized objects, and empty values', () => {
      expect(localize('Plain text', 'am')).toBe('Plain text');
      expect(localize({ en: 'Hello', am: 'Selam' }, 'am')).toBe('Selam');
      expect(localize({ en: 'Fallback', am: '' }, 'am')).toBe('Fallback');
      expect(localize(null, 'en')).toBe('');
      expect(localizeNullable({ en: '', am: '' }, 'en')).toBeNull();
    });
  });

  describe('message templates', () => {
    it('renders templates for all locales and a requested locale', () => {
      expect(renderAllLocales(MessageTemplates.OTP_CODE, '123456')).toMatchObject({
        en: 'Your SmartBus verification code is 123456',
        am: expect.stringContaining('123456'),
      });

      expect(renderTemplate(MessageTemplates.TRIP_ASSIGNMENT_BODY, 'en', 'R1', '2026-06-01')).toBe(
        'You have been assigned to route R1 on 2026-06-01',
      );
    });
  });

  describe('pagination', () => {
    it('builds Prisma pagination args with defaults and explicit sorting', () => {
      expect(buildPagination({})).toEqual({
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });

      expect(buildPagination({ page: 3, limit: 10, sortBy: 'amount', sortOrder: 'asc' })).toEqual({
        skip: 20,
        take: 10,
        orderBy: { amount: 'asc' },
      });
    });

    it('builds pagination metadata', () => {
      expect(buildPaginationMeta(2, 10, 21)).toEqual({
        page: 2,
        limit: 10,
        total: 21,
        totalPages: 3,
      });
    });
  });
});
