import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  env: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? '',
  tokenHansu: process.env.TOKEN_HANSU ?? '',
  tokenClawd: process.env.TOKEN_CLAWD ?? '',
  actionTimeoutMs: parseInt(process.env.ACTION_TIMEOUT_MS ?? '300000', 10),
}));
