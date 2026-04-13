import { Module } from '@nestjs/common';
import { IdempotencyGuard } from './guards/idempotency.guard';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';

/**
 * Import CommonModule in feature modules that use @UseGuards(IdempotencyGuard)
 * or @UseInterceptors(IdempotencyInterceptor).
 *
 * JwtAuthGuard and RolesGuard are registered globally via APP_GUARD in AppModule
 * and do not need to be imported separately.
 */
@Module({
  providers: [IdempotencyGuard, IdempotencyInterceptor],
  exports: [IdempotencyGuard, IdempotencyInterceptor],
})
export class CommonModule {}
