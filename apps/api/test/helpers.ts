import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { LoginResponse } from '@retailchain/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export async function login(
  app: INestApplication,
  username: string,
  password: string,
  client: 'admin' | 'pos' = 'admin',
): Promise<LoginResponse> {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ username, password, client });
  if (res.status !== 200)
    throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as LoginResponse;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const PASSWORDS = {
  owner: 'Owner@2026',
  manager: 'Manager@2026',
  cashier: 'Cashier@2026',
  warehouse: 'Warehouse@2026',
  accountant: 'Accountant@2026',
};
