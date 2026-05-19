import { DEFAULT_LOCALE, Locale } from './localized-string';

type Template<Args extends unknown[] = []> = Record<Locale, (...args: Args) => string>;

export const MessageTemplates = {
  OTP_CODE: {
    en: (code: string) => `Your SmartBus verification code is ${code}`,
    am: (code: string) => `የSmartBus ማረጋገጫ ኮድዎ ${code} ነው`,
  } satisfies Template<[string]>,

  TRIP_ASSIGNMENT_TITLE: {
    en: () => 'New Assignment',
    am: () => 'አዲስ ምደባ',
  } satisfies Template,

  TRIP_ASSIGNMENT_BODY: {
    en: (routeNumber: string, date: string) =>
      `You have been assigned to route ${routeNumber} on ${date}`,
    am: (routeNumber: string, date: string) =>
      `በ${date} ለመስመር ${routeNumber} ተመድበዋል`,
  } satisfies Template<[string, string]>,

  TICKET_REFUND_DESCRIPTION: {
    en: () => 'Ticket expired – refund issued',
    am: () => 'ትኬት ጊዜው አልፎበታል – ገንዘብ ተመላሽ ተደርጓል',
  } satisfies Template,

  TOPUP_INITIATED_DESCRIPTION: {
    en: () => 'Wallet top-up initiated',
    am: () => 'የዋሌት ምሙላት ተጀምሯል',
  } satisfies Template,

  TOPUP_COMPLETED_DESCRIPTION: {
    en: () => 'Wallet top-up completed',
    am: () => 'የዋሌት ምሙላት ተጠናቋል',
  } satisfies Template,

  TOPUP_FAILED_DESCRIPTION: {
    en: () => 'Wallet top-up failed',
    am: () => 'የዋሌት ምሙላት አልተሳካም',
  } satisfies Template,
} as const;

export function renderAllLocales<Args extends unknown[]>(
  template: Template<Args>,
  ...args: Args
): { en: string; am: string } {
  return {
    en: template.en(...args),
    am: template.am(...args),
  };
}

export function renderTemplate<Args extends unknown[]>(
  template: Template<Args>,
  locale: Locale,
  ...args: Args
): string {
  const fn = template[locale] ?? template[DEFAULT_LOCALE];
  return fn(...args);
}
