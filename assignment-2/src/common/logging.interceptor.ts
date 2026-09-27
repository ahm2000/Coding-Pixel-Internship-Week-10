import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { redact } from './redact';

interface LoggableRequest {
  method: string;
  originalUrl?: string;
  url: string;
  body?: unknown;
  headers: Record<string, unknown>;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<LoggableRequest>();
    // Every field a client controls is redacted here, centrally, before
    // it ever reaches a log line - not left to each call site to remember.
    const safeBody = redact(request.body);
    const safeHeaders = redact(request.headers);
    this.logger.debug(
      `${request.method} ${request.originalUrl ?? request.url} body=${JSON.stringify(safeBody)} headers=${JSON.stringify(safeHeaders)}`,
    );
    return next.handle();
  }
}
