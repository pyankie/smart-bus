import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  publicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:3000',
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
  idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS ?? '86400000', 10),
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES ?? '10', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
  otpResendSeconds: parseInt(process.env.OTP_RESEND_SECONDS ?? '60', 10),
  authClockSkewSeconds: parseInt(process.env.AUTH_CLOCK_SKEW_SECONDS ?? '30', 10),
  wallet: {
    minTopupAmount: parseFloat(process.env.MIN_TOPUP_AMOUNT ?? '10'),
    maxTopupAmount: parseFloat(process.env.MAX_TOPUP_AMOUNT ?? '10000'),
  },
  chapa: {
    baseUrl: process.env.CHAPA_BASE_URL ?? 'https://api.chapa.co/v1',
    callbackUrl: process.env.CHAPA_CALLBACK_URL,
    returnUrl: process.env.CHAPA_RETURN_URL,
    webhookSecret: process.env.CHAPA_WEBHOOK_SECRET ?? process.env.PAYMENT_WEBHOOK_SECRET,
  },
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
  enableCron: process.env.ENABLE_CRON === 'true',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  ml: {
    serviceUrl: process.env.ML_SERVICE_URL ?? 'http://localhost:8000',
    routeTimeoutMs: parseInt(process.env.ML_SERVICE_ROUTE_TIMEOUT_MS ?? '3000', 10),
    anomalyTimeoutMs: parseInt(process.env.ML_SERVICE_ANOMALY_TIMEOUT_MS ?? '1500', 10),
    enabled: process.env.ML_SERVICE_ENABLED === 'true',
    token: process.env.ML_SERVICE_TOKEN,
  },
}));
