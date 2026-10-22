import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { WORKSPACE_HEADER } from './common/workspace.decorator';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    allowedHeaders: ['Content-Type', WORKSPACE_HEADER],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Plan B API')
    .setDescription(
      'Persistence for Plan B floor plans. Plans are stored as schema-versioned JSON and ' +
        'validated with the same zod schemas the editor uses. There is no authentication in ' +
        'this MVP: projects are scoped to an anonymous demo workspace id and are disposable.',
    )
    .setVersion('0.1.0')
    .addTag('projects', 'Create, read, update, duplicate and delete floor plan projects')
    .addTag('health', 'Liveness and database readiness')
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config), {
    customSiteTitle: 'Plan B API',
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Plan B API on http://localhost:${port}/api`);
  logger.log(`OpenAPI docs on http://localhost:${port}/docs`);
}

void bootstrap();
