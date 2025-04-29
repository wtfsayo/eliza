# SQL Plugin - Integration Tests

This directory contains integration tests for the `@elizaos/plugin-sql` package. These tests interact with a live PostgreSQL database to ensure the database adapter functions correctly.

## Setup

Before running the tests, ensure you have a PostgreSQL database instance running and accessible. The connection string is configured in `seed/config.ts`.

By default, it attempts to connect to `postgres://postgres:postgres@localhost:5432/eliza`. You can override this by setting the `TEST_DATABASE_URL` environment variable.

```typescript
// seed/config.ts
export const config = {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/eliza',
};
```

## Seed Data

The `seed/` directory contains data used to populate the database for various test scenarios (e.g., agents, entities, rooms). Each test file typically imports seed data relevant to its specific focus.

## Running Tests

Tests are run using `vitest` via `bun` scripts defined in the `package.json`.

### Running All Integration Tests

To run all tests within this integration directory:

```bash
bun run test:integration
```

This command executes the `test:integration` script, which specifically targets the `__tests__/integration` path.

### Running a Single Test File

When developing or debugging, you might want to run only a specific test file. Use the following command, replacing `<path_to_test_file>` with the relative path to the file (e.g., `__tests__/integration/memory.test.ts`):

```bash
bun run test -- <path_to_test_file>
```

**Example:**

```bash
bun run test -- __tests__/integration/memory.test.ts
```

The `--` separates the `bun run` command from the arguments passed directly to `vitest`.
