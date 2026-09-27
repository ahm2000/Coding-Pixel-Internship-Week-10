import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './validation.schema';
import { AppConfigService } from './app-config.service';

// C4: proves W1's own CHECK - removing a required variable stops the
// application from booting, with a message naming it.
//
// `ConfigModule.forRoot()` is called fresh, inside each test, rather than
// through the real `AppConfigModule` - a `@Module({imports: [...]})`
// decorator evaluates its `imports` array once, when the class is first
// defined, not once per `Test.createTestingModule()` call. Going through
// `AppConfigModule` here would validate against whatever `process.env`
// looked like the first time this file's imports ran, silently ignoring
// every `delete process.env.X` a test makes afterward - this was caught
// live: the first version of this test always resolved, never rejected.
function buildTestModule(): TestingModuleBuilder {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        validationSchema,
        validationOptions: { abortEarly: false },
        ignoreEnvFile: true,
      }),
    ],
    providers: [AppConfigService],
  });
}

describe('Config validation (boot)', () => {
  const TRACKED_KEYS = [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
    'PORT',
    'JWT_SECRET',
    'JWT_ACCESS_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
    'ARGON2_MEMORY_COST',
    'ARGON2_TIME_COST',
    'CORS_ORIGIN',
  ] as const;

  let saved: Partial<Record<(typeof TRACKED_KEYS)[number], string>>;

  beforeEach(() => {
    saved = {};
    for (const key of TRACKED_KEYS) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of TRACKED_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('boots normally when every required variable is present', async () => {
    const moduleRef = await buildTestModule().compile();

    const config = moduleRef.get(AppConfigService);
    expect(config.database.host).toBe(process.env.DB_HOST);

    await moduleRef.close();
  });

  it('refuses to boot when JWT_SECRET is missing', async () => {
    delete process.env.JWT_SECRET;

    await expect(buildTestModule().compile()).rejects.toThrow(/JWT_SECRET/);
  });

  it('refuses to boot when PORT is not a number', async () => {
    process.env.PORT = 'abc';

    await expect(buildTestModule().compile()).rejects.toThrow(/PORT/);
  });
});
