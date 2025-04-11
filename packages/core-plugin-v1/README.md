# Core Plugin V1 Compatibility Layer

This package provides a compatibility layer to run v1 plugins with the v2 core application. It translates between v1 and v2 types and handles any necessary adaptations.

## Overview

The `@elizaos/core-plugin-v1` package enables backward compatibility for v1 plugins in the v2 core architecture. It acts as a bridge between the two versions, ensuring that plugins developed for v1 can still function in the newer v2 environment.

## Features

- V1 plugin support in v2 environment
- Type compatibility
- API translation layer
- Test infrastructure for v1 plugins

## Installation

```bash
npm install @elizaos/core-plugin-v1
```

## Usage

### Using V1 Plugins in V2 Application

To use a v1 plugin in your v2 application, simply include the plugin in your character configuration:

```typescript
import { Character } from '@elizaos/core';

const myCharacter: Character = {
  name: 'MyCharacter',
  modelProvider: 'openai',
  bio: 'A character using v1 plugins',
  lore: ['Created to demonstrate v1 plugin compatibility'],
  messageExamples: [],
  postExamples: [],
  topics: [],
  adjectives: [],
  // Include core-plugin-v1 compatibility layer first
  plugins: [
    '@elizaos/core-plugin-v1',
    // Then any v1 plugins you want to use
    '@elizaos/plugin-openai',
    '@elizaos/plugin-elevenlabs',
    // Your custom v1 plugin
    'my-custom-v1-plugin',
  ],
  style: {
    all: [],
    chat: [],
    post: [],
  },
};
```

### Example: Using AgentKit V1 Plugin

The AgentKit plugin demonstrates how a v1 plugin can be structured to work with the v2 core using the compatibility layer:

```typescript
import type { Plugin } from '@elizaos/core';
import { walletProvider, getClient } from './provider';
import { getAgentKitActions } from './actions';

// Initialize actions
const initializeActions = async () => {
  try {
    // Validate environment variables
    const apiKeyName = process.env.CDP_API_KEY_NAME;
    const apiKeyPrivateKey = process.env.CDP_API_KEY_PRIVATE_KEY;

    if (!apiKeyName || !apiKeyPrivateKey) {
      console.warn('⚠️ Missing CDP API credentials - AgentKit actions will not be available');
      return [];
    }

    const actions = await getAgentKitActions({
      getClient,
    });
    console.log('✔ AgentKit actions initialized successfully.');
    return actions;
  } catch (error) {
    console.error('❌ Failed to initialize AgentKit actions:', error);
    return []; // Return empty array instead of failing
  }
};

export const agentKitPlugin: Plugin = {
  name: '[AgentKit] Integration',
  description: 'AgentKit integration plugin',
  providers: [walletProvider],
  evaluators: [],
  services: [],
  actions: await initializeActions(),
};

export default agentKitPlugin;
```

## Testing V1 Plugins

This package includes a comprehensive testing framework for v1 plugins on the v2 core. There are two main test files:

1. `plugins.test.ts` - General test framework for v1 plugins
2. `agentkit-plugin.test.ts` - Specific test for the AgentKit plugin example

### Running Tests

To run the tests:

```bash
# Run all tests
npm test

# Run specific test
npm test -- -t "AgentKit Plugin"
```

### Writing Tests for Your V1 Plugin

To create tests for your own v1 plugin:

1. Create a new test file in the `__tests__` directory
2. Import the testing utilities and your plugin
3. Define test characters and runtime configuration
4. Write tests for your plugin's actions, providers, and services

Example test structure:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AgentRuntime,
  type Character,
  type IAgentRuntime,
  logger,
  stringToUuid,
} from '@elizaos/core-plugin-v2';
import yourPlugin from '../path/to/your/plugin';

// Define test character
const testCharacter: Character = {
  name: 'TestCharacter',
  modelProvider: 'openai',
  bio: 'Test character',
  lore: ['For testing'],
  messageExamples: [],
  postExamples: [],
  topics: [],
  adjectives: [],
  plugins: ['@elizaos/core-plugin-v1'],
  style: { all: [], chat: [], post: [] },
};

let runtime: IAgentRuntime;

beforeAll(async () => {
  // Initialize runtime with your plugin
  testCharacter.id = stringToUuid(testCharacter.name);
  runtime = new AgentRuntime({ character: testCharacter });
  await runtime.initialize();
  runtime.plugins.push(yourPlugin);

  // Register plugin actions
  for (const action of yourPlugin.actions || []) {
    runtime.registerAction(action);
  }
});

// Write your tests
describe('Your Plugin Tests', () => {
  it('should register actions correctly', () => {
    const actionNames = runtime.actions.map((a) => a.name);
    expect(actionNames).toContain('YOUR_ACTION_NAME');
  });

  it('should execute an action successfully', async () => {
    const action = runtime.actions.find((a) => a.name === 'YOUR_ACTION_NAME');
    // Test the action
  });
});
```

## Troubleshooting

### Common Issues

1. **Type Incompatibility**: If you encounter type errors, ensure you're using the correct imports from `@elizaos/core-plugin-v1` rather than directly from `@elizaos/core`.

2. **Plugin Not Loading**: Make sure you include `@elizaos/core-plugin-v1` as the first plugin in your character's plugins array.

3. **Actions Not Registered**: Verify that your plugin correctly exports all actions, providers, and services.

## Contributing

Contributions to improve the compatibility layer are welcome:

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT
