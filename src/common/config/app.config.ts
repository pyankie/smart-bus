import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
  idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS ?? '86400000', 10),
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES ?? '10', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
  otpResendSeconds: parseInt(process.env.OTP_RESEND_SECONDS ?? '60', 10),
  authClockSkewSeconds: parseInt(process.env.AUTH_CLOCK_SKEW_SECONDS ?? '30', 10),
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
  enableCron: process.env.ENABLE_CRON === 'true',
}));
