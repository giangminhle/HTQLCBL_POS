import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('REQ-NFR-01: maps built-in HttpException to { code, message }', () => {
    expect(filter.toApiError(new NotFoundException('Không có'))).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Không có' },
    });
  });

  it('REQ-NFR-01: keeps custom code and details thrown by services', () => {
    const ex = new HttpException({ code: 'NEGATIVE_STOCK', message: 'x', details: { sku: 'A' } }, 409);
    expect(filter.toApiError(ex).body).toEqual({
      code: 'NEGATIVE_STOCK',
      message: 'x',
      details: { sku: 'A' },
    });
  });

  it('REQ-NFR-01: maps ValidationPipe errors to VALIDATION_ERROR with details', () => {
    const ex = new BadRequestException(['name must be a string']);
    const { status, body } = filter.toApiError(ex);
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(['name must be a string']);
  });

  it('REQ-NFR-01: maps Prisma unique violation to 409 CONFLICT', () => {
    const ex = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    expect(filter.toApiError(ex).status).toBe(HttpStatus.CONFLICT);
  });

  it('REQ-NFR-01: hides internals of unknown errors', () => {
    const { status, body } = filter.toApiError(new Error('secret stack info'));
    expect(status).toBe(500);
    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống, vui lòng thử lại' });
  });
});
