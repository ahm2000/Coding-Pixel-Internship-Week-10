import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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
    origin: config.get<string>('CORS_ORIGIN'),
    credentials: true,
  });

  configureApp(app);

  await app.listen(config.get<number>('PORT') ?? 3000);
}
bootstrap();
