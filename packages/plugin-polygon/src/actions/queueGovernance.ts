import {
  type Action,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
  composePromptFromState,
  ModelType,
  type ActionExample,
  TemplateType,
} from '@elizaos/core';
import {
  encodeFunctionData,
  type Address,
  type Hex,
  keccak256,
  stringToHex,
  type Chain,
} from 'viem';
import { WalletProvider, initWalletProvider } from '../providers/PolygonWalletProvider';

// Minimal ABI for OZ Governor queue function
const governorQueueAbi = [
  {
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'calldatas', type: 'bytes[]' },
      { name: 'descriptionHash', type: 'bytes32' },
    ],
    name: 'queue',
    outputs: [], // Or proposalId depending on version
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface QueueGovernanceParams {
  chain: string;
  governorAddress: Address;
  targets: Address[];
  values: string[]; // ETH values as strings
  calldatas: Hex[];
  description: string; // Full description, hash calculated by runner
}

interface Transaction {
  hash: `0x${string}`;
  from: Address;
  to: Address;
  value: bigint;
  chainId: number;
  data?: Hex;
  logs?: any[];
}

const queueGovernanceTemplate = {
  name: 'Queue Governance Proposal',
  description:
    'Generates parameters to queue a passed governance proposal. // Respond with a valid JSON object containing the extracted parameters.',
  parameters: {
    type: 'object',
    properties: {
      chain: { type: 'string', description: 'Blockchain name (e.g., polygon).' },
      governorAddress: { type: 'string', description: 'Address of the Governor contract.' },
      targets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of target contract addresses.',
      },
      values: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of ETH values (strings) for each action.',
      },
      calldatas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of hex-encoded calldata for each action.',
      },
      description: {
        type: 'string',
        description: 'The full text description of the proposal (same as when proposed).',
      },
    },
    required: ['chain', 'governorAddress', 'targets', 'values', 'calldatas', 'description'],
  },
};

class PolygonQueueGovernanceActionRunner {
  constructor(private walletProvider: WalletProvider) {}

  async queue(params: QueueGovernanceParams): Promise<Transaction> {
    const walletClient = this.walletProvider.getWalletClient(params.chain);
    const publicClient = this.walletProvider.getPublicClient(params.chain);
    const chainConfig = this.walletProvider.getChainConfigs(params.chain);

    const numericValues = params.values.map((v) => BigInt(v));
    const descriptionHash = keccak256(stringToHex(params.description));

    const txData = encodeFunctionData({
      abi: governorQueueAbi,
      functionName: 'queue',
      args: [params.targets, numericValues, params.calldatas, descriptionHash],
    });
    logger.debug(
      `Queueing proposal on ${params.chain} at governor ${params.governorAddress} with descHash: ${descriptionHash} (from: "${params.description}")`
    );

    try {
      const kzg = {
        blobToKzgCommitment: (_blob: any) => {
          throw new Error('KZG not impl.');
        },
        computeBlobKzgProof: (_blob: any, _commit: any) => {
          throw new Error('KZG not impl.');
        },
      };
      const hash = await walletClient.sendTransaction({
        account: walletClient.account!,
        to: params.governorAddress,
        value: BigInt(0),
        data: txData,
        chain: chainConfig as Chain,
        kzg,
      });
      logger.info(`Queue transaction sent. Hash: ${hash}. Waiting for receipt...`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        hash,
        from: walletClient.account!.address,
        to: params.governorAddress,
        value: BigInt(0),
        data: txData,
        chainId: chainConfig.id,
        logs: receipt.logs as any[],
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Governance queue failed: ${errMsg}`, error);
      throw new Error(`Governance queue failed: ${errMsg}`);
    }
  }
}

export const queueGovernanceAction: Action = {
  name: 'QUEUE_GOVERNANCE_POLYGON',
  similes: ['POLYGON_GOV_QUEUE', 'SCHEDULE_POLYGON_PROPOSAL'],
  description:
    'Queues a passed governance proposal on a Governor contract on Polygon or other EVM chains.',
  validate: async (runtime: IAgentRuntime, _m: Memory, _s: State | undefined): Promise<boolean> => {
    logger.debug('Validating QUEUE_GOVERNANCE_POLYGON action...');
    const checks = [
      runtime.getSetting('WALLET_PRIVATE_KEY'),
      runtime.getSetting('POLYGON_PLUGINS_ENABLED'),
    ];
    if (checks.some((c) => !c)) {
      logger.error(
        'Required settings (WALLET_PRIVATE_KEY, POLYGON_PLUGINS_ENABLED) not configured.'
      );
      return false;
    }
    try {
      await initWalletProvider(runtime);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error(`WalletProvider initialization failed during validation: ${errMsg}`);
      return false;
    }
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _o: any,
    cb: HandlerCallback | undefined,
    _rs: Memory[] | undefined
  ) => {
    logger.info('Handling QUEUE_GOVERNANCE_POLYGON for message:', message.id);
    try {
      const walletProvider = await initWalletProvider(runtime);
      const actionRunner = new PolygonQueueGovernanceActionRunner(walletProvider);
      const prompt = composePromptFromState({
        state,
        template: queueGovernanceTemplate as unknown as TemplateType,
      });
      const modelResponse = await runtime.useModel(ModelType.LARGE, { prompt });
      let paramsJson;
      try {
        const responseText = modelResponse || '';
        const jsonString = responseText.replace(/^```json(\\r?\\n)?|(\\r?\\n)?```$/g, '');
        paramsJson = JSON.parse(jsonString);
      } catch (e) {
        logger.error('Failed to parse LLM response for queue params:', modelResponse, e);
        throw new Error('Could not understand queue parameters.');
      }
      if (
        !paramsJson.chain ||
        !paramsJson.governorAddress ||
        !paramsJson.targets ||
        !paramsJson.values ||
        !paramsJson.calldatas ||
        !paramsJson.description
      ) {
        throw new Error('Incomplete queue parameters extracted.');
      }
      const queueParams: QueueGovernanceParams = {
        chain: paramsJson.chain as string,
        governorAddress: paramsJson.governorAddress as Address,
        targets: paramsJson.targets as Address[],
        values: paramsJson.values as string[],
        calldatas: paramsJson.calldatas as Hex[],
        description: paramsJson.description as string,
      };
      logger.debug('Queue governance parameters:', queueParams);
      const txResult = await actionRunner.queue(queueParams);
      const successMsg = `Successfully queued proposal on ${queueParams.chain} for governor ${queueParams.governorAddress} (Desc: "${queueParams.description}"). TxHash: ${txResult.hash}`;
      logger.info(successMsg);

      if (cb) {
        await cb({
          text: successMsg,
          content: { success: true, ...txResult },
          actions: ['QUEUE_GOVERNANCE_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: true, ...txResult };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error in QUEUE_GOVERNANCE_POLYGON handler:', errMsg, error);
      if (cb) {
        await cb({
          text: `Error queueing proposal: ${errMsg}`,
          actions: ['QUEUE_GOVERNANCE_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: false, error: errMsg };
    }
  },
  examples: [
    [
      {
        name: 'user',
        content: {
          text: "Queue the proposal 'Test Prop Q1' on Polygon governor 0xGov. Targets: [0xT1], Values: [0], Calldatas: [0xCD1].",
        },
      },
    ],
  ] as ActionExample[],
};
