import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  NODE_ENV: z.string().default('development'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Bad environment config:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  clientOrigins: parsed.data.CLIENT_URL.split(',').map((s) => s.trim()),
};
