import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { AppErrorDetail, AppException } from '../exceptions/app.exception';

interface ErrorEnvelope {
  success: false;
  message: string;
  errors: AppErrorDetail[];
  meta: {
    path: string;
    method: string;
    statusCode: number;
    timestamp: string;
  };
}

/**
 * Converts every unhandled exception into the same JSON envelope used by the
 * response interceptor so API consumers only have to implement one parser.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: AppErrorDetail[] = [];

    if (exception instanceof AppException) {
      status = exception.getStatus();
      message = exception.message;
      errors = exception.errors;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        message = payload;
      } else {
        const body = payload as {
          message?: string | string[];
          errors?: AppErrorDetail[];
        };

        if (Array.isArray(body.message)) {
          message = 'Validation failed';
          errors = body.message.map((item) => ({ message: item }));
        } else {
          message = body.message ?? exception.message;
        }

        if (Array.isArray(body.errors)) {
          errors = body.errors;
        }
      }
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.CONFLICT;
      message = this.describeDatabaseError(exception);
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const envelope: ErrorEnvelope = {
      success: false,
      message,
      errors,
      meta: {
        path: request?.originalUrl ?? '',
        method: request?.method ?? '',
        statusCode: status,
        timestamp: new Date().toISOString(),
      },
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request?.method} ${request?.originalUrl} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request?.method} ${request?.originalUrl} -> ${status} ${message}`,
      );
    }

    response.status(status).json(envelope);
  }

  private describeDatabaseError(exception: unknown): string {
    const driverError = (
      exception as {
        driverError?: { code?: string; sqlMessage?: string };
      }
    ).driverError;
    const code = driverError?.code;

    switch (code) {
      case 'ER_DUP_ENTRY':
        return 'The data already exists (duplicate entry)';
      case 'ER_NO_REFERENCED_ROW_2':
      case 'ER_ROW_IS_REFERENCED_2':
        return 'The data is still referenced by another record';
      default:
        return driverError?.sqlMessage ?? 'Database query failed';
    }
  }
}
