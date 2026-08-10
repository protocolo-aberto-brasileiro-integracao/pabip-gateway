import 'reflect-metadata';
import * as http from 'node:http';
import { json } from 'express';
import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AdminApiModule } from './admin-api/admin-api.module';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { closeServerWithin, createPathGate } from './common/http-listener.util';
import { createPinoLogger } from './common/logging/pino-logger.service';
import { ShutdownService } from './common/shutdown.service';
import { ConfigService } from './config/config.service';
import { IngestionModule } from './ingestion/ingestion.module';
import {
  assertShutdownGracePeriodAllowed,
  resolveAdminPort,
  resolvePublicPort,
  resolveTrustedProxyCidrs,
} from './prisma/boot-guard';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    bodyParser: false,
  });
  app.use(json({ limit: '1mb' }));
  const trustedProxyCidrs = resolveTrustedProxyCidrs();
  app.set('trust proxy', trustedProxyCidrs.length > 0 ? trustedProxyCidrs : 1);

  app.useLogger(createPinoLogger());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const adminApiDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('pabip-gateway admin-api')
      .setDescription('Peers, admin tokens, config, and peer passthrough.')
      .setVersion('1')
      .addApiKey({ type: 'apiKey', name: 'X-Admin-Token', in: 'header' }, 'AdminToken')
      .addApiKey({ type: 'apiKey', name: 'X-Client-Token', in: 'header' }, 'ClientToken')
      .build(),
    { include: [AdminApiModule] },
  );
  SwaggerModule.setup('admin/docs', app, adminApiDocument);

  const ingestionDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('pabip-gateway ingestion')
      .setDescription('POST /image-analytics/events — protocol §6.1/§6.2.')
      .setVersion('1')
      .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'ApiKey')
      .build(),
    { include: [IngestionModule] },
  );
  SwaggerModule.setup('image-analytics/docs', app, ingestionDocument);

  await app.init();

  const configService = app.get(ConfigService);

  assertShutdownGracePeriodAllowed(configService.shutdown.gracePeriodSeconds);

  const publicPort = resolvePublicPort();
  const adminPort = resolveAdminPort();

  const sharedHandler = app.getHttpAdapter().getInstance();
  const publicServer = http.createServer(
    createPathGate(sharedHandler, ['/image-analytics', '/peers']),
  );
  const adminServer = http.createServer(
    createPathGate(sharedHandler, ['/admin', '/healthz', '/readyz', '/metrics']),
  );

  await Promise.all([listen(publicServer, publicPort), listen(adminServer, adminPort)]);
  logger.log(`Public webhook listening on port ${publicPort}.`);
  logger.log(`Admin API listening on port ${adminPort}.`);

  registerShutdownHandler({
    app,
    shutdownService: app.get(ShutdownService),
    configService,
    servers: [publicServer, adminServer],
    logger,
  });
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve());
  });
}

const SHUTDOWN_SOCKET_CLOSE_TIMEOUT_MS = 5_000;

interface ShutdownHandlerDeps {
  app: INestApplication;
  shutdownService: ShutdownService;
  configService: ConfigService;
  servers: http.Server[];
  logger: Logger;
}

function registerShutdownHandler({
  app,
  shutdownService,
  configService,
  servers,
  logger,
}: ShutdownHandlerDeps): void {
  let shuttingDown = false;

  process.on('SIGTERM', () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void runShutdown();
  });

  async function runShutdown(): Promise<void> {
    try {
      logger.log('SIGTERM received — draining before shutdown.');

      shutdownService.beginDraining();
      await shutdownService.drainOutputSink(configService.shutdown.gracePeriodSeconds);

      await Promise.all(
        servers.map((server) => closeServerWithin(server, SHUTDOWN_SOCKET_CLOSE_TIMEOUT_MS)),
      );

      await app.close();
      logger.log('Shutdown complete.');
      process.exit(0);
    } catch (error) {
      logger.error(
        'Unexpected error during shutdown — exiting anyway rather than hanging past the drain window.',
        error instanceof Error ? error.stack : String(error),
      );
      process.exit(1);
    }
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
