import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { DEFAULT_LOCALE, Locale, resolveLocale } from '../utils/localized-string';

export const CurrentLocale = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Locale => {
    const req = ctx.switchToHttp().getRequest<Request & { locale?: Locale }>();
    return resolveLocale(req.locale ?? DEFAULT_LOCALE);
  },
);
