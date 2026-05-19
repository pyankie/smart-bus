import { z } from 'zod';

export const SUPPORTED_LOCALES = ['en', 'am'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LocalizedStringSchema = z.object({
  en: z.string().min(1, 'en is required'),
  am: z.string().min(1, 'am is required'),
});

export const PartialLocalizedStringSchema = z.object({
  en: z.string().min(1).optional(),
  am: z.string().min(1).optional(),
});

export type LocalizedString = z.infer<typeof LocalizedStringSchema>;
export type PartialLocalizedString = z.infer<typeof PartialLocalizedStringSchema>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localize(field: unknown, locale: Locale = DEFAULT_LOCALE): string {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object') {
    const obj = field as Record<string, unknown>;
    const primary = obj[locale];
    if (typeof primary === 'string' && primary.length > 0) return primary;
    const fallback = obj[DEFAULT_LOCALE];
    if (typeof fallback === 'string' && fallback.length > 0) return fallback;
  }
  return '';
}

export function localizeNullable(field: unknown, locale: Locale = DEFAULT_LOCALE): string | null {
  const resolved = localize(field, locale);
  return resolved.length > 0 ? resolved : null;
}
