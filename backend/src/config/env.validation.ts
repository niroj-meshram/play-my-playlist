import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevelName = (typeof LOG_LEVELS)[number];

/** Validated process environment. Access via `ConfigService<EnvironmentVariables, true>`. */
export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 4000;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevelName = 'log';

  @Matches(/^postgres(ql)?:\/\/.+/, { message: 'DATABASE_URL must be a PostgreSQL connection URL' })
  DATABASE_URL: string;

  @Matches(/^rediss?:\/\/.+/, { message: 'REDIS_URL must be a redis:// or rediss:// URL' })
  REDIS_URL: string;

  @IsString()
  @Matches(/^https?:\/\/[^\s/]+$/, {
    message: 'FRONTEND_ORIGIN must be an origin such as http://localhost:3000 (no path)',
  })
  FRONTEND_ORIGIN: string;

  /** HMAC secret for access tokens. Generate with `openssl rand -base64 48`. */
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  ACCESS_TOKEN_TTL_SECONDS: number = 900;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TOKEN_TTL_DAYS: number = 30;

  /** Number of trusted reverse-proxy hops in front of the API (for client IPs used by rate limiting). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS: number = 0;

  /** Rate limiting can only be disabled outside production (used by e2e tests). */
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() === 'true' : value))
  @IsBoolean()
  THROTTLE_ENABLED: boolean = true;
}

/** Fails application startup with a readable message when configuration is invalid. */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const problems = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }

  if (env.NODE_ENV === 'production' && !env.THROTTLE_ENABLED) {
    throw new Error(
      'Invalid environment configuration: THROTTLE_ENABLED cannot be false in production',
    );
  }

  return env;
}
