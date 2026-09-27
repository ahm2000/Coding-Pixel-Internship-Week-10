import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface CheckResult {
  status: 'ok' | 'error';
  message?: string;
}

export interface HealthResult {
  status: 'ok' | 'error';
  checks: {
    app: CheckResult;
    database: CheckResult;
  };
}

// A live process is not the same thing as a live connection (C1's own
// WHY) - `SELECT 1` proves the pool can actually reach Postgres, not just
// that Node is still running.
const DATABASE_CHECK_TIMEOUT_MS = 1500;

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthResult> {
    const database = await this.checkDatabase();
    // "The application" check is deliberately trivial: if this code is
    // running at all, the process itself is up - the interesting
    // question this endpoint answers is always about the database.
    const app: CheckResult = { status: 'ok' };

    return {
      status: database.status === 'ok' ? 'ok' : 'error',
      checks: { app, database },
    };
  }

  // X1: a slow/hanging connection must still answer within the timeout -
  // a health check that blocks forever takes the load balancer down with
  // it, which is worse than reporting unhealthy.
  //
  // `Promise.race` doesn't cancel the loser: a successful query still
  // leaves the timeout's `setTimeout` running in the background for
  // however long is left on the clock. Found live via Jest's own "worker
  // process failed to exit gracefully" warning on an otherwise-passing
  // run - harmless in a long-lived server process, but a real dangling
  // timer, and unnecessary either way. Cleared explicitly once the race
  // is decided, whichever side won.
  private async checkDatabase(): Promise<CheckResult> {
    let timer: NodeJS.Timeout;
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`timed out after ${DATABASE_CHECK_TIMEOUT_MS}ms`),
              ),
            DATABASE_CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'unknown error',
      };
    } finally {
      clearTimeout(timer!);
    }
  }
}
