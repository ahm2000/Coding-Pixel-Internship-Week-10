import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { redact } from './redact';
import { RequestWithId } from './request-context';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

function extractMessage(response: unknown): string | string[] {
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object' && 'message' in response) {
    const message = (response as { message: unknown }).message;
    if (typeof message === 'string' || Array.isArray(message)) {
      return message;
    }
  }
  return 'Error';
}

function extractError(response: unknown, fallback: string): string {
  if (response && typeof response === 'object' && 'error' in response) {
    const error = (response as { error: unknown }).error;
    if (typeof error === 'string') return error;
  }
  return fallback;
}

// C1's "no stack trace, no database message" is unconditional - true in
// every environment, for every non-HttpException failure. X3's
// dev-vs-prod split does NOT touch `message` for that reason: a
// TypeORM/pg driver error's own `.message` routinely contains the query
// fragment or column/table name that failed (verified live: a Postgres
// integer-overflow error came back as
// `value "99999999999999" is out of range for type integer` when this
// filter's first draft forwarded `Error#message` in development - a real
// database message, exactly what C1 forbids, that a "detailed dev mode"
// must not reintroduce). What X3 actually varies is the `error` field:
// production says "Internal Server Error"; development additionally
// names the exception's own constructor (e.g. "QueryFailedError") so a
// developer knows what kind of failure occurred without ever learning
// what it said.
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  // C2: injected, not read from `process.env` directly - the one typed
  // module every other piece of the app reads environment through too.
  // This is why the filter is now resolved via `app.get()` in
  // bootstrap.ts instead of `new`'d directly - only a DI-managed instance
  // can have this constructor-injected.
  constructor(private readonly config: AppConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const isDev = this.config.isDevelopment;
    const errorObj = exception instanceof Error ? exception : undefined;

    let message: string | string[];
    let errorName: string;
    if (isHttpException) {
      const httpResponse = exception.getResponse();
      message = extractMessage(httpResponse);
      errorName = extractError(httpResponse, exception.name);
    } else {
      // Always generic, in both environments - see the note above.
      message = 'Internal server error';
      errorName =
        isDev && errorObj ? errorObj.constructor.name : 'Internal Server Error';
    }

    const body: ErrorBody = {
      statusCode,
      message,
      error: errorName,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // The full detail always goes to the server log, in every
    // environment, redacted the same way every log line is (X2) -
    // "always logged, sometimes returned" is the actual dev/prod split.
    // X3: same `requestId` the access log line for this request carries,
    // and the same JSON-per-line shape.
    if (!isHttpException) {
      this.logger.error(
        JSON.stringify({
          requestId: request.id,
          method: request.method,
          path: request.url,
          body: redact(request.body),
          error: errorObj?.stack ?? String(exception),
        }),
      );
    }

    response.status(statusCode).json(body);
  }
}
