import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import {
  requestIdMiddleware,
  requestLoggingMiddleware,
} from './common/request-context';

// Shared by main.ts and any test, so nothing ever exercises a
// differently-configured app than the one that actually runs in
// production.
export function configureApp(app: INestApplication): void {
  // W2/X3: both run as middleware, before guards - so a guard-thrown
  // 401/403/404/429 still produces exactly one access-log line, sharing
  // the same requestId as anything else that request produces. See
  // request-context.ts for why this isn't a NestInterceptor.
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Resolved from the container (not `new`'d) because it now takes
  // AppConfigService in its constructor (C2) - only a DI-managed instance
  // gets that injected.
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
}
