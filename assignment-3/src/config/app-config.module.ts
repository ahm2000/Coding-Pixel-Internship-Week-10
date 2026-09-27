import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './validation.schema';
import { AppConfigService } from './app-config.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      validationOptions: { abortEarly: false },
      // Under Jest, config comes only from whatever `test-setup.ts` has
      // already put in `process.env` - never a side-channel read of
      // `.env` off disk. Without this, C4's boot-validation test
      // (`delete process.env.JWT_SECRET`) would get silently re-filled
      // the moment ConfigModule re-reads `.env` for itself, since dotenv
      // treats a missing key as "not yet set" and fills it right back in.
      ignoreEnvFile: !!process.env.JEST_WORKER_ID,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
