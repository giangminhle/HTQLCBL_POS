import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@retailchain/shared';

/** Throw an error with the unified body { code, message, details }. */
export function apiError(status: HttpStatus, code: ErrorCode | string, message: string, details?: unknown) {
  return new HttpException({ code, message, ...(details !== undefined ? { details } : {}) }, status);
}

export const forbidden = (code: ErrorCode | string, message: string) =>
  apiError(HttpStatus.FORBIDDEN, code, message);
export const notFound = (message = 'Không tìm thấy dữ liệu') =>
  apiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message);
export const badRequest = (message: string, code: ErrorCode | string = ErrorCode.BAD_REQUEST) =>
  apiError(HttpStatus.BAD_REQUEST, code, message);
export const conflict = (message: string) => apiError(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message);
export const unauthorized = (code: ErrorCode | string, message: string) =>
  apiError(HttpStatus.UNAUTHORIZED, code, message);
