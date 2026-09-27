import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

/**
 * Like ParseIntPipe, but also rejects zero and negative numbers - every
 * :id in this schema is a Postgres SERIAL, so 0 and below can never be a
 * real row. Failing here means the request never reaches a repository
 * lookup with a value that was never going to match anything.
 */
@Injectable()
export class PositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(
        `${metadata.data ?? 'value'} must be a positive integer, got "${value}"`,
      );
    }
    return parsed;
  }
}
