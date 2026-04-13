import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | void> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | void> {
    return next.handle().pipe(
      map((data) => {
        // Don't wrap 204 No Content responses
        const response = context.switchToHttp().getResponse<{ statusCode: number }>();
        if (response.statusCode === 204) return undefined;

        // Don't double-wrap already-shaped responses
        if (isAlreadyWrapped(data)) return data as unknown as ApiResponse<T>;

        return { success: true as const, data };
      }),
    );
  }
}

function isAlreadyWrapped(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    (data as Record<string, unknown>)['success'] === true
  );
}
