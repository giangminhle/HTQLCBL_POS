import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { APP_VERSION } from './common/version';

/** Shared by main.ts and e2e tests so tests exercise the same pipeline as production. */
export function setupApp(app: INestApplication, corsOrigins: string[] = []): void {
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : true, exposedHeaders: ['x-request-id'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const doc = new DocumentBuilder()
    .setTitle('RetailChain POS API')
    .setDescription('API quản lý chuỗi cửa hàng bán lẻ và POS')
    .setVersion(APP_VERSION)
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
}
