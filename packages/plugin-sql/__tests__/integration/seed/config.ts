/**
 * Configuration for integration tests
 */
export const config = {
  // Use a test database URL - this should be set up as an environment variable in CI
  // or provided directly for local testing
  DATABASE_URL:
    process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
};
