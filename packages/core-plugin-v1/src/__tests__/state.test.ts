import { describe, it, expect } from 'vitest';
import { UUID, GoalStatus, Action, RAGKnowledgeItem } from '../types';
import { State } from '../types';
import { State as StateV2 } from '@elizaos/core-plugin-v2';

// Import the conversion functions
import { translateV2StateToV1, translateV1StateToV2 } from '../translators/state-translator';

// Helper function to create valid UUIDs for testing
const createTestUUID = (num: number): UUID => {
  return `00000000-0000-0000-0000-${num.toString().padStart(12, '0')}`;
};

// Create memory data for testing that matches expected structure
const emptyMemoryData = [
  {
    id: createTestUUID(1),
    roomId: createTestUUID(3),
    userId: createTestUUID(4),
    agentId: createTestUUID(5),
    content: {
      text: 'Test message',
    },
  },
];

// Sample actors data for testing
const sampleActorsData = [
  {
    id: createTestUUID(10),
    name: 'User1',
    username: 'user1',
    details: {
      tagline: 'User tagline',
      summary: 'User summary',
      quote: 'User quote',
    },
  },
  {
    id: createTestUUID(5),
    name: 'TestAgent',
    username: 'testagent',
    details: {
      tagline: 'Agent tagline',
      summary: 'Agent summary',
      quote: 'Agent quote',
    },
  },
];

// Sample goals data for testing - fixed to match Goal interface
const sampleGoalsData = [
  {
    id: createTestUUID(20),
    roomId: createTestUUID(3),
    userId: createTestUUID(10),
    name: 'Test Goal 1',
    status: GoalStatus.IN_PROGRESS,
    objectives: [
      { id: '1', description: 'Objective 1', completed: false },
      { id: '2', description: 'Objective 2', completed: true },
    ],
  },
];

// Create a dummy handler and validator for Action type
const dummyHandler = async () => {};
const dummyValidator = async () => true;

// Sample actions data properly implementing Action interface
const sampleActionsData: Action[] = [
  {
    name: 'Action1',
    description: 'Action 1 description',
    similes: ['similar1', 'similar2'],
    examples: [
      [
        {
          user: 'Alice',
          content: {
            text: 'Hello, could you help me with this action?',
          },
        },
        {
          user: 'Agent',
          content: {
            text: 'Sure, I can help with Action1.',
            action: 'Action1',
          },
        },
      ],
      [
        {
          user: 'Bob',
          content: {
            text: 'I need assistance with another use case.',
          },
        },
        {
          user: 'Agent',
          content: {
            text: 'I can perform Action1 for that use case.',
            action: 'Action1',
          },
        },
      ],
    ],
    handler: dummyHandler,
    validate: dummyValidator,
  },
];

// Sample knowledge and RAG data
const sampleKnowledgeData = [
  {
    id: createTestUUID(30),
    content: { text: 'Knowledge item 1' },
  },
];

const sampleRagKnowledgeData: RAGKnowledgeItem[] = [
  {
    id: createTestUUID(31),
    agentId: createTestUUID(5),
    content: { text: 'RAG Knowledge item 1' },
  },
];

describe('State adapter', () => {
  it('should convert from v2 state to v1 state correctly', () => {
    // Arrange
    const stateV2: StateV2 = {
      values: {
        userId: createTestUUID(123),
        agentName: 'TestAgent',
        bio: 'Agent bio text',
        lore: 'Agent lore text',
        recentMessages: 'Some recent messages',
        actors: 'User1, TestAgent',
        goals: 'Goal 1: Do something',
        actionNames: 'Action1, Action2',
        actions: 'Action descriptions',
        actionExamples: 'Action example text',
        knowledge: 'Knowledge text',
        providers: 'Provider information',
      },
      data: {
        walletBalance: 100,
        tokenPrices: { ETH: 2000 },
        recentMessagesData: emptyMemoryData,
        actorsData: sampleActorsData,
        goalsData: sampleGoalsData,
        knowledgeData: sampleKnowledgeData,
        ragKnowledgeData: sampleRagKnowledgeData,
        actionsData: sampleActionsData,
      },
      text: 'Current state information',
    };

    // Act
    const stateV1 = translateV2StateToV1(stateV2);

    // Assert
    expect(stateV1.userId).toBe(createTestUUID(123));
    expect(stateV1.agentName).toBe('TestAgent');
    expect(stateV1.walletBalance).toBe(100);
    expect(stateV1.tokenPrices).toEqual({ ETH: 2000 });
    expect(stateV1.text).toBe('Current state information');

    // Check complex object arrays
    expect(stateV1.recentMessagesData).toEqual(emptyMemoryData);
    expect(stateV1.actorsData).toEqual(sampleActorsData);
    expect(stateV1.goalsData).toEqual(sampleGoalsData);
    expect(stateV1.knowledgeData).toHaveLength(1);
    expect(stateV1.ragKnowledgeData).toHaveLength(1);
    expect(stateV1.actionsData).toHaveLength(1);

    // Check that action examples are properly transformed
    expect(stateV1.actionsData[0].examples).toHaveLength(2);
    expect(stateV1.actionsData[0].examples[0]).toHaveLength(2);
    expect(stateV1.actionsData[0].examples[0][0].user).toBe('Alice');
    expect(stateV1.actionsData[0].examples[0][1].user).toBe('Agent');
    expect(stateV1.actionsData[0].examples[0][1].content.action).toBe('Action1');

    // Check string fields
    expect(stateV1.bio).toBe('Agent bio text');
    expect(stateV1.lore).toBe('Agent lore text');
    expect(stateV1.recentMessages).toBe('Some recent messages');
    expect(stateV1.actors).toBe('User1, TestAgent');
    expect(stateV1.goals).toBe('Goal 1: Do something');
    expect(stateV1.actionNames).toBe('Action1, Action2');
    expect(stateV1.actions).toBe('Action descriptions');
    expect(stateV1.actionExamples).toBe('Action example text');
    expect(stateV1.knowledge).toBe('Knowledge text');
    expect(stateV1.providers).toBe('Provider information');

    // Check that default properties are set for unspecified fields
    expect(stateV1.messageDirections).toBe('');
    expect(stateV1.postDirections).toBe('');
    expect(stateV1.characterPostExamples).toBe('');
    expect(stateV1.characterMessageExamples).toBe('');
  });

  it('should convert from v1 state to v2 state correctly', () => {
    // Arrange
    const stateV1: State = {
      userId: createTestUUID(123),
      agentName: 'TestAgent',
      walletBalance: 100,
      tokenPrices: { ETH: 2000 },
      text: 'Current state information',
      recentMessages: 'Some recent messages',
      recentMessagesData: emptyMemoryData,
      bio: 'Agent bio',
      lore: 'Agent lore',
      messageDirections: 'Handle messages this way',
      postDirections: 'Handle posts this way',
      roomId: createTestUUID(456),
      actors: 'User, Agent',
      actorsData: sampleActorsData,
      goals: 'Goal 1: Do something',
      goalsData: sampleGoalsData,
      knowledgeData: sampleKnowledgeData,
      ragKnowledgeData: sampleRagKnowledgeData,
      knowledge: 'Some knowledge text',
      actionNames: 'Action1, Action2',
      actions: 'Action details',
      actionsData: sampleActionsData,
      providers: 'Provider information',
      characterPostExamples: 'Post example text',
      characterMessageExamples: 'Message example text',
      evaluators: 'Evaluator description',
      evaluatorNames: 'Evaluator1, Evaluator2',
      evaluatorExamples: 'Evaluator example text',
      recentPosts: 'Recent posts',
      recentInteractionsData: [...emptyMemoryData],
      recentMessageInteractions: 'Message interactions',
      recentPostInteractions: 'Post interactions',
      attachments: 'Attachment text',
    };

    // Act
    const stateV2 = translateV1StateToV2(stateV1);

    // Assert
    expect(stateV2.values).toBeDefined();
    expect(stateV2.data).toBeDefined();
    expect(stateV2.text).toBe('Current state information');

    // Check values structure
    expect(stateV2.values.userId).toBe(createTestUUID(123));
    expect(stateV2.values.agentName).toBe('TestAgent');
    expect(stateV2.values.bio).toBe('Agent bio');
    expect(stateV2.values.lore).toBe('Agent lore');
    expect(stateV2.values.messageDirections).toBe('Handle messages this way');
    expect(stateV2.values.postDirections).toBe('Handle posts this way');
    expect(stateV2.values.roomId).toBe(createTestUUID(456));
    expect(stateV2.values.actors).toBe('User, Agent');
    expect(stateV2.values.recentMessages).toBe('Some recent messages');
    expect(stateV2.values.goals).toBe('Goal 1: Do something');
    expect(stateV2.values.knowledge).toBe('Some knowledge text');
    expect(stateV2.values.actionNames).toBe('Action1, Action2');
    expect(stateV2.values.actions).toBe('Action details');
    expect(stateV2.values.providers).toBe('Provider information');
    expect(stateV2.values.characterPostExamples).toBe('Post example text');
    expect(stateV2.values.characterMessageExamples).toBe('Message example text');
    expect(stateV2.values.evaluators).toBe('Evaluator description');
    expect(stateV2.values.evaluatorNames).toBe('Evaluator1, Evaluator2');
    expect(stateV2.values.evaluatorExamples).toBe('Evaluator example text');
    expect(stateV2.values.recentPosts).toBe('Recent posts');
    expect(stateV2.values.recentMessageInteractions).toBe('Message interactions');
    expect(stateV2.values.recentPostInteractions).toBe('Post interactions');
    expect(stateV2.values.attachments).toBe('Attachment text');

    // Check data structure
    expect(stateV2.data.recentMessagesData).toEqual(emptyMemoryData);
    expect(stateV2.data.actorsData).toEqual(sampleActorsData);
    expect(stateV2.data.goalsData).toEqual(sampleGoalsData);
    expect(stateV2.data.knowledgeData).toHaveLength(1);
    expect(stateV2.data.ragKnowledgeData).toHaveLength(1);
    expect(stateV2.data.actionsData).toHaveLength(1);
    expect(stateV2.data.recentInteractionsData).toEqual(emptyMemoryData);

    // Check action examples are properly transformed
    expect(stateV2.data.actionsData[0].examples).toHaveLength(2);
    expect(stateV2.data.actionsData[0].examples[0]).toHaveLength(2);
    expect(stateV2.data.actionsData[0].examples[0][0].name).toBe('Alice');
    expect(stateV2.data.actionsData[0].examples[0][1].name).toBe('Agent');
    expect(stateV2.data.actionsData[0].examples[0][1].content.actions).toContain('Action1');

    // Check custom property preservation
    expect(stateV2.walletBalance).toBe(100);
    expect(stateV2.tokenPrices).toEqual({ ETH: 2000 });
  });

  it('should handle empty or undefined values', () => {
    // Arrange
    const emptyV2: StateV2 = {
      values: {},
      data: {},
      text: '',
    };

    // Act
    const emptyV1 = translateV2StateToV1(emptyV2);
    const backToV2 = translateV1StateToV2(emptyV1);

    // Assert - check that all default fields are set in V1
    expect(emptyV1.bio).toBe('');
    expect(emptyV1.lore).toBe('');
    expect(emptyV1.messageDirections).toBe('');
    expect(emptyV1.postDirections).toBe('');
    expect(emptyV1.actors).toBe('');
    expect(emptyV1.recentMessages).toBe('');
    expect(emptyV1.recentMessagesData).toEqual([]);
    expect(emptyV1.actionNames).toBe('');
    expect(emptyV1.actions).toBe('');
    expect(emptyV1.actionsData).toEqual([]);
    expect(emptyV1.providers).toBe('');
    expect(emptyV1.evaluators).toBe('');
    expect(emptyV1.evaluatorNames).toBe('');
    expect(emptyV1.knowledge).toBe('');
    expect(emptyV1.knowledgeData).toEqual([]);
    expect(emptyV1.text).toBe('');

    // Check values properties individually
    expect(backToV2.values.bio).toBe('');
    expect(backToV2.values.lore).toBe('');
    expect(backToV2.values.messageDirections).toBe('');
    expect(backToV2.values.postDirections).toBe('');
    expect(backToV2.values.actors).toBe('');
    expect(backToV2.values.recentMessages).toBe('');
    expect(backToV2.values.actionNames).toBe('');
    expect(backToV2.values.actions).toBe('');
    expect(backToV2.values.actionExamples).toBe('');
    expect(backToV2.values.providers).toBe('');
    expect(backToV2.values.characterPostExamples).toBe('');
    expect(backToV2.values.characterMessageExamples).toBe('');
    expect(backToV2.values.evaluators).toBe('');
    expect(backToV2.values.evaluatorNames).toBe('');
    expect(backToV2.values.evaluatorExamples).toBe('');
    expect(backToV2.values.knowledge).toBe('');
    expect(backToV2.values.goals).toBe('');
    expect(backToV2.values.recentPosts).toBe('');
    expect(backToV2.values.recentMessageInteractions).toBe('');
    expect(backToV2.values.recentPostInteractions).toBe('');
    expect(backToV2.values.attachments).toBe('');

    // Check data arrays
    expect(backToV2.data.recentMessagesData).toEqual([]);
    expect(backToV2.data.knowledgeData).toEqual([]);
    expect(backToV2.data.actionsData).toEqual([]);
    expect(backToV2.data.goalsData).toEqual([]);
    expect(backToV2.data.ragKnowledgeData).toEqual([]);
    expect(backToV2.data.recentInteractionsData).toEqual([]);

    // Text property
    expect(backToV2.text).toBe('');
  });

  it('should handle additional properties from real-world plugins', () => {
    // Example from plugin-ton (row 102 in CSV)
    const tonStateV1: State = {
      userId: createTestUUID(123),
      agentName: 'TonBot',
      walletAddress: '0x123abc',
      walletBalance: 10.5,
      stakedAmount: 5.25,
      lastTransaction: '2023-04-01',
      roomId: createTestUUID(456),
      recentMessages: 'Recent messages here',
      recentMessagesData: emptyMemoryData,
      bio: 'TON blockchain assistant',
      lore: 'Helps with TON transactions',
      messageDirections: 'Handle DMs from users',
      postDirections: 'Post updates about TON',
      actors: 'User, TonBot',
      text: 'Current state',
    };

    // Convert to v2 and back
    const tonStateV2 = translateV1StateToV2(tonStateV1);
    const tonStateV1Again = translateV2StateToV1(tonStateV2);

    // Original properties should be preserved through the round trip
    expect(tonStateV1Again.walletAddress).toBe('0x123abc');
    expect(tonStateV1Again.walletBalance).toBe(10.5);
    expect(tonStateV1Again.stakedAmount).toBe(5.25);
    expect(tonStateV1Again.lastTransaction).toBe('2023-04-01');
    expect(tonStateV1Again.recentMessagesData).toEqual(emptyMemoryData);

    // Check that V2 structure is correct
    expect(tonStateV2.values.bio).toBe('TON blockchain assistant');
    expect(tonStateV2.values.lore).toBe('Helps with TON transactions');
    expect(tonStateV2.values.messageDirections).toBe('Handle DMs from users');
    expect(tonStateV2.values.postDirections).toBe('Post updates about TON');
    expect(tonStateV2.values.actors).toBe('User, TonBot');
    expect(tonStateV2.values.recentMessages).toBe('Recent messages here');
    expect(tonStateV2.data.recentMessagesData).toEqual(emptyMemoryData);

    // Custom properties should be at top level
    expect(tonStateV2.walletAddress).toBe('0x123abc');
    expect(tonStateV2.walletBalance).toBe(10.5);
    expect(tonStateV2.stakedAmount).toBe(5.25);
    expect(tonStateV2.lastTransaction).toBe('2023-04-01');
  });

  // Test specifically for action example transformation
  it('should correctly transform action examples between v1 and v2 formats', () => {
    // Arrange
    const v1State: State = {
      text: 'Test state',
      actionsData: sampleActionsData,
    };

    // Act: Convert to v2 and back to v1
    const v2State = translateV1StateToV2(v1State);
    const backToV1 = translateV2StateToV1(v2State);

    // Assert: Check the action examples were properly transformed
    // V2 format uses 'name' instead of 'user'
    expect(v2State.data.actionsData[0].examples[0][0].name).toBe('Alice');
    expect(v2State.data.actionsData[0].examples[0][1].name).toBe('Agent');

    // V2 format uses 'actions' array instead of 'action' string
    expect(v2State.data.actionsData[0].examples[0][1].content.actions).toContain('Action1');
    expect(Array.isArray(v2State.data.actionsData[0].examples[0][1].content.actions)).toBe(true);

    // Verify round trip preserves format
    expect(backToV1.actionsData[0].examples[0][0].user).toBe('Alice');
    expect(backToV1.actionsData[0].examples[0][1].user).toBe('Agent');
    expect(backToV1.actionsData[0].examples[0][1].content.action).toBe('Action1');
  });
});
