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

export default (): { database: { uri: string } } => ({
  database: {
    uri: buildMongoUri(),
  },
});
