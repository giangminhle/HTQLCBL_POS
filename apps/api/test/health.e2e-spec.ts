import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@retailchain/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

describe('GET /health (e2e)', () => {
  let app: INestApplication;
  const prismaMock = { $queryRaw: jest.fn(), $disconnect: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('REQ-NFR-01: returns ok + db up when the database answers', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(healthResponseSchema.parse(res.body)).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('REQ-NFR-01: returns degraded + db down when the database is unreachable', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('REQ-NFR-01: echoes x-request-id or generates one', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    const echoed = await request(app.getHttpServer()).get('/health').set('x-request-id', 'abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');
    const generated = await request(app.getHttpServer()).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('REQ-NFR-01: unknown route returns unified error format', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: expect.any(String) });
  });

  it('REQ-NFR-01: serves Swagger UI at /docs', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);
  });
});
