import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { HealthResult, HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResult> {
    const result = await this.healthService.check();
    res.status(
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return result;
  }
}
