import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { DEFAULT_SUCCESS_MESSAGE } from '../constants/app.constants';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { PageMeta, PaginatedResult } from '../dto/paginated-result.dto';

export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: PageMeta;
}

/**
 * Wraps every controller result into the standard response envelope:
 *
 * ```json
 * { "success": true, "message": "Success", "data": { } }
 * ```
 *
 * Paginated results (see `PaginatedResult`) additionally expose a `meta` block.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T | T[]>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T | T[]>> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_SUCCESS_MESSAGE;

    return next.handle().pipe(
      map((data) => {
        if (data instanceof PaginatedResult) {
          return {
            success: true as const,
            message,
            data: data.items as unknown as T,
            meta: data.meta,
          };
        }

        return {
          success: true as const,
          message,
          data: (data ?? null) as T,
        };
      }),
    );
  }
}
