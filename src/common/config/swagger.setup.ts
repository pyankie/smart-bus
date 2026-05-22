import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Configures and mounts the Swagger / OpenAPI UI.
 * Called from main.ts only when SWAGGER_ENABLED=true.
 * Docs are served at /docs.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('SmartBus API')
    .setDescription('SmartBus backend API — v1')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token' },
      'access-token',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'Idempotency-Key',
        description: 'Idempotency key (UUID v4) for wallet top-up and ticket purchase',
      },
      'idempotency-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
