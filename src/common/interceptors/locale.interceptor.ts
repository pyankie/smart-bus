import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import {
  DEFAULT_LOCALE,
  Locale,
  SUPPORTED_LOCALES,
} from '../utils/localized-string';

@Injectable()
export class LocaleInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { locale?: Locale }>();
    req.locale = pickLocale(req.query?.lang, req.headers['accept-language']);
    return next.handle();
  }
}

function pickLocale(query: unknown, header: string | string[] | undefined): Locale {
  const fromQuery = parseLocale(typeof query === 'string' ? query : undefined);
  if (fromQuery) return fromQuery;

  const headerStr = Array.isArray(header) ? header[0] : header;
  if (!headerStr) return DEFAULT_LOCALE;

  // Accept-Language: am-ET,am;q=0.9,en;q=0.8
  for (const part of headerStr.split(',')) {
    const tag = part.trim().split(';')[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0];
    const parsed = parseLocale(base);
    if (parsed) return parsed;
  }

  return DEFAULT_LOCALE;
}

function parseLocale(value: string | undefined): Locale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(lower) ? (lower as Locale) : null;
}
