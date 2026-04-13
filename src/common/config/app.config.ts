import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
  idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS ?? '86400000', 10),
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
  enableCron: process.env.ENABLE_CRON === 'true',
}));
