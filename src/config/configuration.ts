function trimEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

function buildMongoUri(): string {
  const user = trimEnv(process.env.DATABASE_USER);
  const password = trimEnv(process.env.DATABASE_PASS);
  const host = trimEnv(process.env.DATABASE_HOST) || 'localhost';
  const port = trimEnv(process.env.DATABASE_PORT) || '27017';
  const name = trimEnv(process.env.DATABASE_NAME);
  const hasCredentials = user.length > 0 && password.length > 0;
  if (hasCredentials) {
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
  }
  return `mongodb://${host}:${port}/${name}`;
}

export default (): {
  database: { uri: string };
  rabbitmq: {
    url: string;
    voiceExchange: string;
    voiceQueue: string;
    prefetch: number;
  };
} => {
  const prefetchRaw: string = trimEnv(process.env.RABBITMQ_PREFETCH);
  const parsedPrefetch: number = Number.parseInt(prefetchRaw || '10', 10);
  const prefetch: number = Number.isFinite(parsedPrefetch) && parsedPrefetch > 0 ? parsedPrefetch : 10;
  return {
    database: {
      uri: buildMongoUri(),
    },
    rabbitmq: {
      url: trimEnv(process.env.RABBITMQ_URL),
      voiceExchange: trimEnv(process.env.RABBITMQ_VOICE_EXCHANGE) || 'omega.voice',
      voiceQueue: trimEnv(process.env.RABBITMQ_VOICE_QUEUE) || 'crm.customers.voice_call_logs',
      prefetch,
    },
  };
};
