import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { redact } from './redact';

export interface RequestWithId extends Request {
  id: string;
}

// X3: one id per request, generated here (or taken from an incoming
// caller-supplied header) before anything else runs, so every log line
// this request produces - the access log below, and the exception
// filter's error log if it fails - can carry the same value.
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : randomUUID();
  (req as RequestWithId).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

const httpLogger = new Logger('HTTP');

// W2: one structured line per request, carrying method/path/status/
// duration - via `res.on('finish')`, not a `NestInterceptor`.
//
// A real gap found live: interceptors sit *after* guards in Nest's
// pipeline (middleware -> guards -> interceptors -> pipes -> handler), so
// a guard-thrown exception (JwtAuthGuard's 401, RolesGuard's 403/404,
// ThrottlerGuard's 429 - most of what actually errors in this API) never
// reaches an interceptor's `tap({ error })` at all. The first version of
// this logger was a `NestInterceptor` and silently produced zero access-
// log lines for exactly those cases - confirmed live by triggering a
// guard-level 500 and finding only the exception filter's line, no
// paired access-log line. `res.on('finish')` fires once the response is
// actually sent, no matter which layer produced it, so it's the one hook
// that can't be skipped by something earlier in the chain throwing.
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    const request = req as RequestWithId;
    const entry: Record<string, unknown> = {
      requestId: request.id,
      method: req.method,
      path: req.originalUrl ?? req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };

    // X2: redacted centrally, here, before anything reaches a log line -
    // not left to each call site to remember. Presence is checked on the
    // raw header/body, since `redact()` itself always returns a value
    // (even for `undefined`), which would otherwise put an `authorization`
    // field on every line, present or not.
    if (req.headers.authorization !== undefined) {
      const redacted = redact({ authorization: req.headers.authorization }) as {
        authorization: unknown;
      };
      entry.authorization = redacted.authorization;
    }
    if (req.body && Object.keys(req.body as object).length > 0) {
      entry.body = redact(req.body);
    }

    httpLogger.log(JSON.stringify(entry));
  });

  next();
}
