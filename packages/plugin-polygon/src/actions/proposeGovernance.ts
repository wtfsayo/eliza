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
} from '@elizaos/core';
// import { type Chain, polygon as polygonChain, mainnet as ethereumChain } from 'viem/chains'; // Chains managed by Provider
import {
  // createWalletClient, http, type WalletClient, // Provided by WalletProvider instance
  encodeFunctionData,
  type Address,
  type Hex,
  // PublicClient, createPublicClient, fallback, // Provided by WalletProvider instance
  type Transport, // Not directly used, but WalletProvider uses it
  type Account, // Not directly used, but WalletProvider uses it
  type Chain, // For type annotation
} from 'viem';
// import { privateKeyToAccount } from 'viem/accounts'; // Handled by Provider

import { WalletProvider, initWalletProvider } from '../providers/PolygonWalletProvider';

// Minimal ABI for OZ Governor propose function
const governorProposeAbi = [
  {
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'calldatas', type: 'bytes[]' },
      { name: 'description', type: 'string' },
    ],
    name: 'propose',
    outputs: [{ name: 'proposalId', type: 'uint256' }],
    stateMutability: 'nonpayable', // or 'payable' if it can receive value
    type: 'function',
  },
] as const; // Use 'as const' for better type inference with viem

// REMOVE INLINE WalletProvider, ChainConfig, and initWalletProvider

interface ProposeGovernanceParams {
  chain: string; // e.g., "polygon", "ethereum"
  governorAddress: Address;
  targets: Address[];
  values: string[]; // Array of ETH values as strings (e.g., "0", "0.1") to be converted to BigInt
  calldatas: Hex[];
  description: string;
}

interface GovernanceTransaction extends Transaction {
  // Assuming Transaction type from bridgeDeposit
  logs?: any[]; // viem Log[]
  proposalId?: bigint; // Extracted from logs if possible
}
interface Transaction {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  chainId: number;
  data?: Hex;
}

const proposeGovernanceTemplate = {
  name: 'Propose Governance Action',
  description:
    'Generates parameters to submit a new governance proposal. // Respond with a valid JSON object containing the extracted parameters.',
  parameters: {
    type: 'object',
    properties: {
      chain: { type: 'string', description: 'Blockchain name (e.g., polygon).' },
      governorAddress: { type: 'string', description: 'Address of the Governor.' },
      targets: { type: 'array', items: { type: 'string' }, description: 'Target addresses.' },
      values: {
        type: 'array',
        items: { type: 'string' },
        description: 'ETH values (strings) for actions.',
      },
      calldatas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hex-encoded calldata for actions.',
      },
      description: { type: 'string', description: 'Proposal description.' },
    },
    required: ['chain', 'governorAddress', 'targets', 'values', 'calldatas', 'description'],
  },
};

class PolygonProposeGovernanceActionRunner {
  constructor(private walletProvider: WalletProvider) {} // Use imported WalletProvider

  async propose(params: ProposeGovernanceParams): Promise<GovernanceTransaction> {
    const walletClient = this.walletProvider.getWalletClient(params.chain);
    const publicClient = this.walletProvider.getPublicClient(params.chain);
    const chainConfig = this.walletProvider.getChainConfigs(params.chain); // viem.Chain from provider

    const numericValues = params.values.map((v) => BigInt(v));

    const txData = encodeFunctionData({
      abi: governorProposeAbi,
      functionName: 'propose',
      args: [params.targets, numericValues, params.calldatas, params.description],
    });

    try {
      logger.debug(`Proposing on ${params.chain} to ${params.governorAddress}`);
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
        chain: chainConfig as Chain, // Ensure chainConfig is typed as viem.Chain
        kzg,
      });

      logger.info(`Proposal transaction sent. Hash: ${hash}. Waiting for receipt...`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      logger.debug('Transaction receipt:', receipt);

      let proposalId: bigint | undefined;
      // Proposal ID parsing logic remains complex and ABI-dependent

      return {
        hash,
        from: walletClient.account!.address,
        to: params.governorAddress,
        value: BigInt(0),
        data: txData,
        chainId: chainConfig.id,
        logs: receipt.logs as any[],
        proposalId,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Governance proposal failed: ${errMsg}`, error);
      throw new Error(`Governance proposal failed: ${errMsg}`);
    }
  }
}

export const proposeGovernanceAction: Action = {
  name: 'PROPOSE_GOVERNANCE_POLYGON',
  similes: ['CREATE_POLYGON_PROPOSAL', 'SUBMIT_POLYGON_GOVERNANCE_ACTION'],
  description: 'Submits a new governance proposal.',

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    logger.debug('Validating PROPOSE_GOVERNANCE_POLYGON action...');
    const checks = [
      runtime.getSetting('WALLET_PRIVATE_KEY'),
      runtime.getSetting('POLYGON_PLUGINS_ENABLED'),
    ];
    if (checks.some((check) => !check)) {
      logger.error(
        'Required settings (WALLET_PRIVATE_KEY, POLYGON_PLUGINS_ENABLED) are not configured.'
      );
      return false;
    }
    try {
      await initWalletProvider(runtime);
    } catch (e) {
      const errMsg = error instanceof Error ? e.message : String(e);
      logger.error(`WalletProvider initialization failed during validation: ${errMsg}`);
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: any,
    callback: HandlerCallback | undefined,
    _responses: Memory[] | undefined
  ) => {
    logger.info('Handling PROPOSE_GOVERNANCE_POLYGON for message:', message.id);
    try {
      const walletProvider = await initWalletProvider(runtime);
      const actionRunner = new PolygonProposeGovernanceActionRunner(walletProvider);

      const prompt = composePromptFromState({
        state,
        template: proposeGovernanceTemplate,
        message: message.content.text,
      });

      const modelResponse = await runtime.useModel(ModelType.LARGE, { prompt });
      let paramsJson;
      try {
        const responseText = modelResponse.text || '';
        const jsonString = responseText.replace(/^```json\n?|\n?```$/g, '');
        paramsJson = JSON.parse(jsonString);
      } catch (e) {
        logger.error('Failed to parse LLM response for propose params:', modelResponse.text, e);
        throw new Error('Could not understand proposal parameters.');
      }

      if (
        !paramsJson.chain ||
        !paramsJson.governorAddress ||
        !paramsJson.targets ||
        !paramsJson.values ||
        !paramsJson.calldatas ||
        !paramsJson.description
      ) {
        throw new Error('Incomplete proposal parameters extracted.');
      }

      const proposeParams: ProposeGovernanceParams = {
        chain: paramsJson.chain as string,
        governorAddress: paramsJson.governorAddress as Address,
        targets: paramsJson.targets as Address[],
        values: paramsJson.values as string[],
        calldatas: paramsJson.calldatas as Hex[],
        description: paramsJson.description as string,
      };

      logger.debug('Propose governance parameters:', proposeParams);
      const txResult = await actionRunner.propose(proposeParams);

      let successMsg = `Proposed governance action on ${proposeParams.chain} to ${proposeParams.governorAddress}. Desc: "${proposeParams.description}". TxHash: ${txResult.hash}.`;
      if (txResult.proposalId) {
        successMsg += ` Proposal ID: ${txResult.proposalId}`;
      }
      logger.info(successMsg);

      if (callback) {
        await callback({
          text: successMsg,
          content: { success: true, ...txResult },
          actions: ['PROPOSE_GOVERNANCE_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: true, ...txResult };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error in PROPOSE_GOVERNANCE_POLYGON handler:', errMsg, error);
      if (callback) {
        await callback({
          text: `Error proposing governance action: ${errMsg}`,
          actions: ['PROPOSE_GOVERNANCE_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        role: 'user',
        content: {
          text: 'Propose a treasury transfer of 1000 DAI (0xAddrDAI) to 0xRecipient on Polygon governor 0xGovAddr. Desc: Quarterly budget.',
        },
      },
      undefined,
    ],
  ] as ActionExample[],
};
