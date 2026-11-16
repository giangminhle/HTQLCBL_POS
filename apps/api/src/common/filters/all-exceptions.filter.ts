import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError, ErrorCode } from '@retailchain/shared';
import type { Request, Response } from 'express';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Every error leaves the API as { code, message, details? }.
 * Services control the body with `throw new HttpException({ code, message, details }, status)`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const { status, body } = this.toApiError(exception);

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId: req.id, path: req.url },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    res.status(status).json(body);
  }

  toApiError(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const fallbackCode =
        STATUS_TO_CODE[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);

      if (typeof response === 'string') {
        return { status, body: { code: fallbackCode, message: response } };
      }
      const r = response as { code?: unknown; message?: unknown; details?: unknown };
      // class-validator (ValidationPipe) puts the list of violations in `message`.
      if (Array.isArray(r.message)) {
        return {
          status,
          body: { code: ErrorCode.VALIDATION_ERROR, message: 'Dữ liệu không hợp lệ', details: r.message },
        };
      }
      return {
        status,
        body: {
          code: typeof r.code === 'string' ? r.code : fallbackCode,
          message: typeof r.message === 'string' ? r.message : exception.message,
          ...(r.details !== undefined ? { details: r.details } : {}),
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: { code: ErrorCode.CONFLICT, message: 'Dữ liệu đã tồn tại', details: exception.meta },
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          body: { code: ErrorCode.NOT_FOUND, message: 'Không tìm thấy dữ liệu' },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: ErrorCode.INTERNAL_ERROR, message: 'Lỗi hệ thống, vui lòng thử lại' },
    };
  }
}
