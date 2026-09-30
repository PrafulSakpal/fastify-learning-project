function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  HOST: process.env.HOST ?? '0.0.0.0',
  JWT_SECRET: requireEnv('JWT_SECRET'),
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6381',
};
