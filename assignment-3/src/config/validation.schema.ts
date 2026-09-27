import * as Joi from 'joi';

// W1/C2: every variable the app actually reads, validated for presence
// AND type - Joi.number() rejects `PORT=abc` outright, it does not
// silently coerce it to NaN. Runs once, at boot, inside
// ConfigModule.forRoot() - a validation failure here throws before any
// other module (in particular TypeOrmModule, which depends on
// AppConfigService) ever gets a chance to open a connection.
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  PORT: Joi.number().port().default(3000),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().required(),

  ARGON2_MEMORY_COST: Joi.number().integer().min(1).required(),
  ARGON2_TIME_COST: Joi.number().integer().min(1).required(),

  CORS_ORIGIN: Joi.string().uri().required(),
});
