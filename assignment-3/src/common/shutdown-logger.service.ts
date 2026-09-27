import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

// C3: `onApplicationShutdown` only ever fires because `main.ts` calls
// `app.enableShutdownHooks()` - without that call Nest never wires
// process signals into its lifecycle at all, and neither this line nor
// `@nestjs/typeorm`'s own `onApplicationShutdown` (which closes the
// connection pool) would ever run; the process would just be killed.
@Injectable()
export class ShutdownLoggerService implements OnApplicationShutdown {
  private readonly logger = new Logger('Shutdown');

  onApplicationShutdown(signal?: string): void {
    this.logger.log(
      `Received ${signal ?? 'shutdown signal'} - no longer accepting new work, closing the database pool.`,
    );
  }
}
