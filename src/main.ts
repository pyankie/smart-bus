import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './common/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 3000;
  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? ['*'];
  const swaggerEnabled = config.get<boolean>('app.swaggerEnabled') ?? false;

  const instance = app.getHttpAdapter().getInstance() as express.Express;
  instance.set('trust proxy', 1);

  app.use(helmet());

  app.enableCors({
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: !corsOrigins.includes('*'),
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (swaggerEnabled) {
    setupSwagger(app);
  }

  await app.listen(port);
}

void bootstrap();
