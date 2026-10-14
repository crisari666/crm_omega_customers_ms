export type RedisConnectionOptions = {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  readonly db?: number;
  readonly tls?: Record<string, never>;
  readonly maxRetriesPerRequest: null;
};

const DEFAULT_REDIS_PORT = 6379;

/** Converts `redis://user:pass@host:port/db` (or `rediss://`) into BullMQ/ioredis options. */
export function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  const dbSegment = url.pathname.replace('/', '');
  const db = dbSegment === '' ? undefined : Number.parseInt(dbSegment, 10);
  return {
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : DEFAULT_REDIS_PORT,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(db !== undefined && Number.isFinite(db) ? { db } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
