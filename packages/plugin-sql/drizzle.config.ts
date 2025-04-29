import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle/migrations',
  migrations: {
    schema: 'public',
  },
  dbCredentials: {
    url: 'postgres://postgres:postgres@localhost:5432/eliza',
  },
  breakpoints: true,
});
