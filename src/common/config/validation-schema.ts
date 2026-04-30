import { z } from 'zod';

const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().default('*'), // comma-separated list in prod
  IDEMPOTENCY_TTL_MS: z.string().regex(/^\d+$/).transform(Number).default('86400000'),
  OTP_TTL_MINUTES: z.string().regex(/^\d+$/).transform(Number).default('10'),
  OTP_MAX_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).default('5'),
  OTP_RESEND_SECONDS: z.string().regex(/^\d+$/).transform(Number).default('60'),
  AUTH_CLOCK_SKEW_SECONDS: z.string().regex(/^\d+$/).transform(Number).default('30'),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // SMS / OTP
  SMS_PROVIDER_API_KEY: z.string().optional(),
  SMS_PROVIDER_URL: z.string().url().default('https://smsethiopia.com/api/sms/send'),

  // Payment
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  MIN_TOPUP_AMOUNT: z.string().regex(/^\d+$/).transform(Number).default('1000'),
  MAX_TOPUP_AMOUNT: z.string().regex(/^\d+$/).transform(Number).default('1000000'),
  CHAPA_SECRET_KEY: z.string().optional(),
  CHAPA_BASE_URL: z.string().url().default('https://api.chapa.co/v1'),
  CHAPA_CALLBACK_URL: z.string().url().optional(),
  CHAPA_RETURN_URL: z.string().url().optional(),
  CHAPA_WEBHOOK_SECRET: z.string().optional(),

  // QR signing — HMAC-SHA256
  QR_SIGNING_SECRET: z.string().min(32),

  // Jobs
  ENABLE_CRON: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Swagger
  SWAGGER_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // Firebase / Push Notifications
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
});

export type EnvironmentVariables = z.infer<typeof envSchema>;

/**
 * Called by ConfigModule `validate` option on startup.
 * Calls process.exit(1) on any validation error — boot must fail loudly.
 */
export const validateEnv = (config: Record<string, unknown>): EnvironmentVariables => {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    console.error('❌  Environment validation failed:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
};
