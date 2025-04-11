import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import {
  AgentRuntime,
  type Character,
  type IAgentRuntime,
  type TestSuite,
  type TestCase,
  logger,
  stringToUuid,
} from '@elizaos/core-plugin-v2';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

// Test timeout
const TEST_TIMEOUT = 300000;

// Sample AgentKit plugin for testing
// Note: In a real test, you might want to import the actual plugin
const mockAgentKitPlugin = {
  name: '[AgentKit] Integration',
  description: 'AgentKit integration plugin for testing',
  providers: [
    {
      get: async (_runtime: IAgentRuntime) => {
        return 'Mock wallet address: 0x1234567890abcdef';
      },
    },
  ],
  evaluators: [],
  services: [],
  actions: [
    {
      name: 'MOCK_ACTION',
      description: 'Mock action for testing',
      similes: [],
      validate: async () => true,
      handler: async (
        _runtime: IAgentRuntime,
        _message: any,
        _state: any,
        _options?: Record<string, unknown>,
        callback?: any
      ) => {
        callback?.({ text: 'Mock action executed', content: { result: 'success' } });
        return true;
      },
      examples: [],
    },
  ],
};

// Define test characters
const defaultCharacter: Character = {
  name: 'TestCharacter',
  modelProvider: 'openai',
  bio: 'A test character for running v1 plugin tests',
  lore: ['Created for testing v1 plugins on v2 core'],
  messageExamples: [],
  postExamples: [],
  topics: ['testing', 'plugins'],
  adjectives: ['helpful', 'testing-oriented'],
  plugins: ['@elizaos/core-plugin-v1'],
  style: {
    all: [],
    chat: [],
    post: [],
  },
};

// Character with specific v1 plugin configuration
const v1PluginCharacter: Character = {
  ...defaultCharacter,
  name: 'V1PluginTester',
  plugins: ['@elizaos/core-plugin-v1', '@elizaos/plugin-openai'],
};

// Store runtimes for each character
const agentRuntimes = new Map<string, IAgentRuntime>();

/**
 * Initialize runtime for a test character
 */
async function initializeRuntime(character: Character): Promise<IAgentRuntime> {
  try {
    // Ensure character has an ID
    character.id = stringToUuid(character.name);

    // Create runtime
    const runtime = new AgentRuntime({
      character,
      fetch: async (url: string, options: any) => {
        logger.debug(`Test fetch: ${url}`);
        return fetch(url, options);
      },
    });

    // Setup database adapter (if needed for your tests)
    // For this example, we're assuming a mock/in-memory adapter would be used

    // Initialize runtime
    await runtime.initialize();

    // Register mock plugin for testing
    // In a real implementation, you'd load actual v1 plugins here
    runtime.plugins.push(mockAgentKitPlugin);

    // Register actions from the mock plugin
    for (const action of mockAgentKitPlugin.actions) {
      runtime.registerAction(action);
    }

    logger.info(`Test runtime initialized for ${character.name}`);
    return runtime;
  } catch (error) {
    logger.error(`Failed to initialize test runtime for ${character.name}:`, error);
    throw error;
  }
}

/**
 * Test runner class for running plugin tests
 */
class TestRunner {
  private runtime: IAgentRuntime;
  private results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };
  }

  /**
   * Run a test case
   */
  private async runTestCase(test: TestCase, suiteName: string): Promise<void> {
    this.results.total++;
    const startTime = performance.now();

    try {
      await test.fn(this.runtime);
      this.results.passed++;
      const duration = performance.now() - startTime;
      logger.info(`✓ ${test.name} (${Math.round(duration)}ms)`);
    } catch (error) {
      this.results.failed++;
      logger.error(`✗ ${test.name}`);
      logger.error(error);
    }
  }

  /**
   * Run a test suite
   */
  private async runTestSuite(suite: TestSuite): Promise<void> {
    logger.info(`\nTest suite: ${suite.name}`);
    for (const test of suite.tests) {
      await this.runTestCase(test, suite.name);
    }
  }

  /**
   * Run tests for all plugins in the runtime
   */
  public async runPluginTests(): Promise<typeof this.results> {
    logger.info(`Running plugin tests for ${this.runtime.character.name}...`);

    for (const plugin of this.runtime.plugins) {
      try {
        logger.info(`Testing plugin: ${plugin.name}`);

        // Create test suite for the plugin
        const testSuite: TestSuite = {
          name: `${plugin.name} Tests`,
          tests: [
            // Test action registration
            {
              name: 'should register actions correctly',
              fn: async () => {
                const actionNames = this.runtime.actions.map((a) => a.name);
                for (const action of plugin.actions || []) {
                  expect(actionNames).toContain(action.name);
                }
              },
            },

            // Test provider functionality
            {
              name: 'should run providers correctly',
              fn: async () => {
                for (const provider of plugin.providers || []) {
                  if (provider.get) {
                    const result = await provider.get(this.runtime, null, null);
                    expect(result).toBeTruthy();
                  }
                }
              },
            },

            // Test action execution
            {
              name: 'should execute actions correctly',
              fn: async () => {
                for (const action of plugin.actions || []) {
                  let actionResult: any = null;

                  await action.handler(
                    this.runtime,
                    {
                      userId: '00000000-0000-0000-0000-000000000000',
                      agentId: this.runtime.agentId,
                      roomId: '00000000-0000-0000-0000-000000000000',
                      content: { text: 'Test message' },
                    },
                    {},
                    {},
                    (response) => {
                      actionResult = response;
                    }
                  );

                  expect(actionResult).toBeTruthy();
                }
              },
            },
          ],
        };

        await this.runTestSuite(testSuite);

        // Run plugin's own tests if available
        if (plugin.tests) {
          const pluginTests = Array.isArray(plugin.tests) ? plugin.tests : [plugin.tests];

          for (const suite of pluginTests) {
            await this.runTestSuite(suite);
          }
        }
      } catch (error) {
        logger.error(`Error in plugin ${plugin.name}:`, error);
      }
    }

    // Log test summary
    this.logTestSummary();

    return this.results;
  }

  /**
   * Log test results
   */
  private logTestSummary(): void {
    logger.info('\n==== Test Summary ====');
    logger.info(`Total tests: ${this.results.total}`);
    logger.info(`Passed: ${this.results.passed}`);

    if (this.results.failed > 0) {
      logger.error(`Failed: ${this.results.failed}`);
    } else {
      logger.info('Failed: 0');
    }

    if (this.results.skipped > 0) {
      logger.info(`Skipped: ${this.results.skipped}`);
    }

    logger.info('=====================\n');
  }
}

// Initialize runtimes before tests
beforeAll(async () => {
  const characters = [defaultCharacter, v1PluginCharacter];

  for (const character of characters) {
    const runtime = await initializeRuntime(character);
    agentRuntimes.set(character.name, runtime);
  }
}, TEST_TIMEOUT);

// Cleanup after tests
afterAll(async () => {
  for (const [characterName, runtime] of agentRuntimes.entries()) {
    try {
      // Close any database connections or other resources
      if (runtime.databaseAdapter) {
        await runtime.databaseAdapter.close();
      }
      logger.info(`Cleaned up ${characterName}`);
    } catch (error) {
      logger.error(`Error during cleanup for ${characterName}:`, error);
    }
  }
});

// Core tests
describe('V1 Plugin Compatibility Tests', () => {
  it(
    'should run tests for default character',
    async () => {
      const runtime = agentRuntimes.get(defaultCharacter.name);
      if (!runtime) throw new Error(`Runtime not found for ${defaultCharacter.name}`);

      const testRunner = new TestRunner(runtime);
      const results = await testRunner.runPluginTests();

      expect(results.failed).toBe(0);
    },
    TEST_TIMEOUT
  );

  it(
    'should run tests for v1 plugin character',
    async () => {
      const runtime = agentRuntimes.get(v1PluginCharacter.name);
      if (!runtime) throw new Error(`Runtime not found for ${v1PluginCharacter.name}`);

      const testRunner = new TestRunner(runtime);
      const results = await testRunner.runPluginTests();

      expect(results.failed).toBe(0);
    },
    TEST_TIMEOUT
  );
});

// AgentKit plugin specific tests
describe('AgentKit Plugin Tests', () => {
  it(
    'should register AgentKit actions',
    async () => {
      // This test would import and test the actual AgentKit plugin
      // For now, we're using the mock plugin for demonstration
      const runtime = agentRuntimes.get(v1PluginCharacter.name);
      if (!runtime) throw new Error(`Runtime not found for ${v1PluginCharacter.name}`);

      const actionNames = runtime.actions.map((a) => a.name);
      expect(actionNames).toContain('MOCK_ACTION');
    },
    TEST_TIMEOUT
  );

  it(
    'should execute AgentKit actions',
    async () => {
      const runtime = agentRuntimes.get(v1PluginCharacter.name);
      if (!runtime) throw new Error(`Runtime not found for ${v1PluginCharacter.name}`);

      // Find the mock action
      const mockAction = runtime.actions.find((a) => a.name === 'MOCK_ACTION');
      expect(mockAction).toBeTruthy();

      if (mockAction) {
        let actionResult: any = null;

        await mockAction.handler(
          runtime,
          {
            userId: '00000000-0000-0000-0000-000000000000',
            agentId: runtime.agentId,
            roomId: '00000000-0000-0000-0000-000000000000',
            content: { text: 'Test message' },
          },
          {},
          {},
          (response) => {
            actionResult = response;
          }
        );

        expect(actionResult).toBeTruthy();
        expect(actionResult.text).toBe('Mock action executed');
      }
    },
    TEST_TIMEOUT
  );
});
