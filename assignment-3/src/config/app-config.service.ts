import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

export interface JwtConfig {
  secret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

export interface Argon2Config {
  memoryCost: number;
  timeCost: number;
}

// C2: the one typed module the rest of the app reads configuration
// through. By the time this is ever constructed, ConfigModule's Joi
// schema has already validated every key below is present and the right
// type - the non-null assertions here are safe because of that, not a
// shortcut around it.
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV')!;
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get port(): number {
    return this.config.get<number>('PORT')!;
  }

  get corsOrigin(): string {
    return this.config.get<string>('CORS_ORIGIN')!;
  }

  get database(): DatabaseConfig {
    return {
      host: this.config.get<string>('DB_HOST')!,
      port: this.config.get<number>('DB_PORT')!,
      username: this.config.get<string>('DB_USERNAME')!,
      password: this.config.get<string>('DB_PASSWORD')!,
      name: this.config.get<string>('DB_NAME')!,
    };
  }

  get jwt(): JwtConfig {
    return {
      secret: this.config.get<string>('JWT_SECRET')!,
      accessExpiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN')!,
      refreshExpiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN')!,
    };
  }

  get argon2(): Argon2Config {
    return {
      memoryCost: this.config.get<number>('ARGON2_MEMORY_COST')!,
      timeCost: this.config.get<number>('ARGON2_TIME_COST')!,
    };
  }
}
