import { HttpException, HttpStatus } from '@nestjs/common';

export interface AppErrorDetail {
  field?: string;
  message: string;
}

/**
 * Business level exception.
 *
 * Anything thrown with this exception is considered an expected outcome
 * (validation, permission, quota, ...) and is translated into a clean JSON
 * payload by the global exception filter.
 */
export class AppException extends HttpException {
  readonly errors: AppErrorDetail[];

  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    errors: AppErrorDetail[] = [],
  ) {
    super({ message, errors }, status);
    this.errors = errors;
  }

  /** `true` when this exception carries the given HTTP status. */
  hasStatus(status: HttpStatus): boolean {
    return this.getStatus() === Number(status);
  }

  static badRequest(
    message: string,
    errors: AppErrorDetail[] = [],
  ): AppException {
    return new AppException(message, HttpStatus.BAD_REQUEST, errors);
  }

  static unauthorized(message = 'Unauthorized'): AppException {
    return new AppException(message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(
    message = 'You are not allowed to perform this action',
  ): AppException {
    return new AppException(message, HttpStatus.FORBIDDEN);
  }

  static notFound(message = 'Data not found'): AppException {
    return new AppException(message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string): AppException {
    return new AppException(message, HttpStatus.CONFLICT);
  }

  static tooManyRequests(
    message: string,
    errors: AppErrorDetail[] = [],
  ): AppException {
    return new AppException(message, HttpStatus.TOO_MANY_REQUESTS, errors);
  }

  static serviceUnavailable(message: string): AppException {
    return new AppException(message, HttpStatus.SERVICE_UNAVAILABLE);
  }

  static internal(message = 'Internal server error'): AppException {
    return new AppException(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
