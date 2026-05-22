export { CurrentUser } from './decorators/current-user.decorator';
export { CurrentLocale } from './decorators/current-locale.decorator';
export { IsLocalizedString, IsPartialLocalizedString } from './decorators/is-localized-string.decorator';
export { IS_PUBLIC_KEY, Public } from './decorators/public.decorator';
export { ROLES_KEY, Roles } from './decorators/roles.decorator';
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { IdempotencyGuard, IDEMPOTENCY_HEADER } from './guards/idempotency.guard';
export { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
export { LocaleInterceptor } from './interceptors/locale.interceptor';
export type { JwtPayload } from './interfaces/jwt-payload.interface';
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LocalizedStringSchema,
  PartialLocalizedStringSchema,
  isLocale,
  resolveLocale,
  localize,
  localizeNullable,
} from './utils/localized-string';
export type { Locale, LocalizedString, PartialLocalizedString } from './utils/localized-string';
export { MessageTemplates, renderAllLocales, renderTemplate } from './utils/message-templates';
