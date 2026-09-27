import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  // X1: a real CSP, not the wide-open default. This API serves no HTML
  // itself, so default-src 'self' with everything else closed doesn't
  // block anything it actually does today - and stays ready for a future
  // docs route (e.g. Swagger) without needing 'unsafe-inline'/'unsafe-eval'.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  // The allowed origin comes from config, never a literal in this file -
  // a wildcard here plus credentials is something a browser refuses
  // outright, which is exactly the failure mode CORS exists to prevent.
  app.enableCors({
    origin: config.corsOrigin,
    credentials: true,
  });

  configureApp(app);

  // C3: without this, Nest never subscribes to SIGTERM/SIGINT at all -
  // the process would just be killed mid-request, in-flight work dropped,
  // the database pool left open. With it, @nestjs/typeorm's own
  // onApplicationShutdown hook closes the pool, and ShutdownLoggerService
  // (see app.module.ts) logs the signal that triggered it.
  app.enableShutdownHooks();

  await app.listen(config.port);
}
bootstrap();
