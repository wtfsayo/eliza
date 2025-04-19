import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema',
  out: './drizzle/migrations',
  migrations: {
    schema: 'public',
  },
  dbCredentials: {
    url: 'postgresql://postgres:postgres@localhost:5432/eliza',
  },
  breakpoints: true,
});
