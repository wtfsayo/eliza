import {
  type Plugin,
  type IAgentRuntime,
  type Action,
  type Provider,
  type ProviderResult,
  logger,
  Service,
} from '@elizaos/core';
import { z } from 'zod';
import { ethers } from 'ethers';

import { transferPolygonAction } from './actions/transfer';
import { delegatePolygonAction } from './actions/delegate';
import { getCheckpointStatusAction } from './actions/getCheckpointStatus';
import { proposeGovernanceAction } from './actions/proposeGovernance';
import { voteGovernanceAction } from './actions/voteGovernance';
import { getValidatorInfoAction } from './actions/getValidatorInfo';
import { getDelegatorInfoAction } from './actions/getDelegatorInfo';
import { withdrawRewardsAction } from './actions/withdrawRewards';
import { bridgeDepositAction } from './actions/bridgeDeposit';
import { IPolygonWalletContext, polygonWalletProvider } from './providers/PolygonWalletProvider';
import {
  PolygonRpcService,
  ValidatorInfo,
  DelegatorInfo,
  ValidatorStatus,
} from './services/PolygonRpcService';
import { getGasPriceEstimates, GasPriceEstimates } from './services/GasService';

// --- Configuration Schema --- //
const configSchema = z.object({
  POLYGON_RPC_URL: z.string().url('Invalid Polygon RPC URL').min(1),
  ETHEREUM_RPC_URL: z.string().url('Invalid Ethereum RPC URL').min(1),
  PRIVATE_KEY: z.string().min(1, 'Private key is required'),
  POLYGONSCAN_KEY: z.string().min(1, 'PolygonScan API Key is required'),
});

// Infer the type from the schema
type PolygonPluginConfig = z.infer<typeof configSchema>;

// Helper to parse amount/shares (could be moved to utils)
function parseBigIntString(value: unknown, unitName: string): bigint {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid ${unitName} amount: Must be a string representing an integer.`);
  }
  try {
    return BigInt(value);
  } catch (e) {
    throw new Error(`Invalid ${unitName} amount: Cannot parse '${value}' as BigInt.`);
  }
}

// --- Define Actions --- //
const polygonActions: Action[] = [
  transferPolygonAction,
  getValidatorInfoAction,
  getDelegatorInfoAction,
  bridgeDepositAction,
  getCheckpointStatusAction,
  proposeGovernanceAction,
  voteGovernanceAction,
  {
    name: 'GET_L2_BLOCK_NUMBER',
    description: 'Gets the current block number on Polygon (L2).',
    validate: async () => true,
    handler: async (runtime) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');
      const blockNumber = await rpcService.getCurrentBlockNumber();
      return {
        text: `Current Polygon block number: ${blockNumber}`,
        actions: ['GET_L2_BLOCK_NUMBER'],
      };
    },
    examples: [],
  },
  {
    name: 'GET_MATIC_BALANCE',
    description: "Gets the MATIC balance for the agent's address on Polygon (L2).",
    validate: async () => true,
    handler: async (runtime, message, state) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');

      // TODO: Determine the correct way to get the agent's address.
      // It might come from runtime context, another service, or require the provider differently.
      const agentAddress = runtime.getSetting('AGENT_ADDRESS'); // Example placeholder
      if (!agentAddress) throw new Error('Could not determine agent address');

      logger.info(`Fetching MATIC balance for address: ${agentAddress}`);
      const balanceWei = await rpcService.getNativeBalance(agentAddress);
      const balanceMatic = ethers.formatEther(balanceWei);
      return {
        text: `Your MATIC balance (${agentAddress}): ${balanceMatic}`,
        actions: ['GET_MATIC_BALANCE'],
        data: { address: agentAddress, balanceWei: balanceWei.toString(), balanceMatic },
      };
    },
    examples: [],
  },
  {
    name: 'GET_POLYGON_GAS_ESTIMATES',
    description: 'Gets current gas price estimates for Polygon from PolygonScan.',
    validate: async () => true,
    handler: async (runtime) => {
      const estimates: GasPriceEstimates = await getGasPriceEstimates(runtime);
      let text = 'Polygon Gas Estimates (Wei):\n';
      text += `  Safe Low Priority: ${estimates.safeLow?.maxPriorityFeePerGas?.toString() ?? 'N/A'}\n`;
      text += `  Average Priority:  ${estimates.average?.maxPriorityFeePerGas?.toString() ?? 'N/A'}\n`;
      text += `  Fast Priority:     ${estimates.fast?.maxPriorityFeePerGas?.toString() ?? 'N/A'}\n`;
      text += `  Estimated Base:  ${estimates.estimatedBaseFee?.toString() ?? 'N/A'}`;
      if (estimates.fallbackGasPrice) {
        text += `\n  (Used Fallback Price: ${estimates.fallbackGasPrice.toString()})`;
      }
      return { text, actions: ['GET_POLYGON_GAS_ESTIMATES'], data: estimates };
    },
    examples: [],
  },
  {
    name: 'GET_L1_VALIDATOR_INFO',
    description: 'Gets details for a specific validator from Ethereum L1.',
    validate: async () => true,
    handler: async (runtime, message, state, options) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');
      const validatorId = options?.validatorId as number | undefined;
      if (typeof validatorId !== 'number') throw new Error('Validator ID (number) is required.');

      const info: ValidatorInfo | null = await rpcService.getValidatorInfo(validatorId);
      if (!info) {
        return {
          text: `Validator ${validatorId} not found on L1.`,
          actions: ['GET_L1_VALIDATOR_INFO'],
        };
      }
      const statusText = ValidatorStatus[info.status] ?? 'Unknown';
      const text = `L1 Validator ${validatorId}: Status: ${statusText}, Commission: ${info.commissionRate * 100}%, Total Stake: ${ethers.formatEther(info.totalStake)} MATIC`;
      return { text, actions: ['GET_L1_VALIDATOR_INFO'], data: { validatorId, info } };
    },
    examples: [],
  },
  {
    name: 'GET_L1_DELEGATOR_INFO',
    description: 'Gets staking details for a delegator on a specific validator from Ethereum L1.',
    validate: async () => true,
    handler: async (runtime, message, state, options) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');
      const validatorId = options?.validatorId as number | undefined;
      let delegatorAddress = options?.delegatorAddress as string | undefined;
      if (typeof validatorId !== 'number') throw new Error('Validator ID (number) is required.');
      if (!delegatorAddress) {
        delegatorAddress = runtime.getSetting('AGENT_ADDRESS');
        if (!delegatorAddress)
          throw new Error('Delegator address not specified and agent address not configured.');
      }

      const info: DelegatorInfo | null = await rpcService.getDelegatorInfo(
        validatorId,
        delegatorAddress
      );
      if (!info) {
        return {
          text: `No delegation found for address ${delegatorAddress} on validator ${validatorId}.`,
          actions: ['GET_L1_DELEGATOR_INFO'],
        };
      }
      const text = `L1 Delegation (V:${validatorId}, D:${delegatorAddress}): Staked: ${ethers.formatEther(info.delegatedAmount)} MATIC, Rewards: ${ethers.formatEther(info.pendingRewards)} MATIC`;
      return {
        text,
        actions: ['GET_L1_DELEGATOR_INFO'],
        data: { validatorId, delegatorAddress, info },
      };
    },
    examples: [],
  },
  {
    name: 'DELEGATE_L1',
    description: 'Delegates MATIC/POL to a validator on Ethereum L1.',
    validate: async () => true,
    handler: async (runtime, message, state, options) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');

      const validatorId = options?.validatorId as number | undefined;
      const amountWeiStr = options?.amountWei as string | undefined;
      if (typeof validatorId !== 'number') throw new Error('Validator ID (number) is required.');
      if (typeof amountWeiStr !== 'string') throw new Error('Amount in Wei (string) is required.');

      const amountWei = parseBigIntString(amountWeiStr, 'delegation');

      logger.info(`Action: Delegating ${amountWeiStr} Wei to validator ${validatorId}`);
      const txHash = await rpcService.delegate(validatorId, amountWei);

      return {
        text: `Delegation transaction sent to L1: ${txHash}. Check explorer for confirmation.`,
        actions: ['DELEGATE_L1'],
        data: { validatorId, amountWei: amountWeiStr, transactionHash: txHash },
      };
    },
    examples: [],
  },
  {
    name: 'UNDELEGATE_L1',
    description: 'Initiates undelegation (unbonding) of Validator Shares on Ethereum L1.',
    validate: async () => true,
    handler: async (runtime, message, state, options) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');

      const validatorId = options?.validatorId as number | undefined;
      const sharesAmountWeiStr = options?.sharesAmountWei as string | undefined;
      if (typeof validatorId !== 'number') throw new Error('Validator ID (number) is required.');
      if (typeof sharesAmountWeiStr !== 'string')
        throw new Error('Shares amount in Wei (string) is required.');

      const sharesAmountWei = parseBigIntString(sharesAmountWeiStr, 'shares');

      logger.info(
        `Action: Undelegating ${sharesAmountWeiStr} shares from validator ${validatorId}`
      );
      const txHash = await rpcService.undelegate(validatorId, sharesAmountWei);

      return {
        text: `Undelegation transaction sent to L1: ${txHash}. Unbonding period applies.`,
        actions: ['UNDELEGATE_L1'],
        data: { validatorId, sharesAmountWei: sharesAmountWeiStr, transactionHash: txHash },
      };
    },
    examples: [],
  },
  {
    name: 'WITHDRAW_REWARDS_L1',
    description: 'Withdraws accumulated staking rewards from a validator on Ethereum L1.',
    validate: async () => true,
    handler: async (runtime, message, state, options) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');

      const validatorId = options?.validatorId as number | undefined;
      if (typeof validatorId !== 'number') throw new Error('Validator ID (number) is required.');

      logger.info(`Action: Withdrawing rewards from validator ${validatorId}`);
      const txHash = await rpcService.withdrawRewards(validatorId);

      return {
        text: `Reward withdrawal transaction sent to L1: ${txHash}. Check explorer for confirmation.`,
        actions: ['WITHDRAW_REWARDS_L1'],
        data: { validatorId, transactionHash: txHash },
      };
    },
    examples: [],
  },
  {
    name: 'RESTAKE_REWARDS_L1',
    description: 'Withdraws rewards and restakes them to the same validator on Ethereum L1.',
    validate: async () => true,
    handler: async (runtime, message, state, options) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');

      const validatorId = options?.validatorId as number | undefined;
      if (typeof validatorId !== 'number') throw new Error('Validator ID (number) is required.');

      logger.info(`Action: Restaking rewards for validator ${validatorId}`);
      const delegateTxHash = await rpcService.restakeRewards(validatorId);

      if (!delegateTxHash) {
        return {
          text: `No rewards found to restake for validator ${validatorId}.`,
          actions: ['RESTAKE_REWARDS_L1'],
          data: { validatorId, status: 'no_rewards' },
        };
      }

      return {
        text: `Restake operation initiated. Delegation transaction sent: ${delegateTxHash}. Check L1 explorer.`,
        actions: ['RESTAKE_REWARDS_L1'],
        data: { validatorId, transactionHash: delegateTxHash, status: 'initiated' },
      };
    },
    examples: [],
  },
  {
    name: 'BRIDGE_DEPOSIT_L1',
    description:
      'Deposits ERC20 tokens (incl. POL) from Ethereum L1 to Polygon L2 via the PoS bridge.',
    validate: async () => true,
    handler: async (runtime, message, state, options) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');

      const tokenAddressL1 = options?.tokenAddressL1 as string | undefined;
      const amountWeiStr = options?.amountWei as string | undefined;
      const recipientAddressL2 = options?.recipientAddressL2 as string | undefined;

      if (!tokenAddressL1 || !ethers.isAddress(tokenAddressL1))
        throw new Error('Valid L1 token address (tokenAddressL1) is required.');
      if (typeof amountWeiStr !== 'string') throw new Error('Amount in Wei (string) is required.');
      if (recipientAddressL2 && !ethers.isAddress(recipientAddressL2))
        throw new Error('Invalid recipient address (recipientAddressL2).');

      const amountWei = parseBigIntString(amountWeiStr, 'deposit');

      logger.info(
        `Action: Bridging ${amountWeiStr} Wei of ${tokenAddressL1} to L2` +
          (recipientAddressL2 ? ` for ${recipientAddressL2}` : '')
      );
      const txHash = await rpcService.bridgeDeposit(tokenAddressL1, amountWei, recipientAddressL2);

      return {
        text: `Bridge deposit transaction sent to L1: ${txHash}. Tokens will arrive on L2 after confirmation.`,
        actions: ['BRIDGE_DEPOSIT_L1'],
        data: {
          tokenAddressL1,
          amountWei: amountWeiStr,
          recipientAddressL2,
          transactionHash: txHash,
        },
      };
    },
    examples: [],
  },
  {
    name: 'IS_L2_BLOCK_CHECKPOINTED',
    description: 'Checks if a Polygon L2 block has been checkpointed on Ethereum L1.',
    validate: async () => true,
    handler: async (runtime, message, state, options) => {
      const rpcService = runtime.getService<PolygonRpcService>(PolygonRpcService.serviceType);
      if (!rpcService) throw new Error('PolygonRpcService not available');

      const l2BlockNumberInput = options?.l2BlockNumber as number | string | undefined;
      if (l2BlockNumberInput === undefined)
        throw new Error('L2 block number (l2BlockNumber) is required.');

      let l2BlockNumber: bigint;
      try {
        l2BlockNumber = BigInt(l2BlockNumberInput.toString());
        if (l2BlockNumber < 0n) throw new Error(); // Basic validation
      } catch {
        throw new Error('Invalid L2 block number format.');
      }

      logger.info(`Action: Checking checkpoint status for L2 block ${l2BlockNumber}`);
      const isCheckpointed = await rpcService.isL2BlockCheckpointed(l2BlockNumber);

      return {
        text: `L2 block ${l2BlockNumber} checkpointed status on L1: ${isCheckpointed}.`,
        actions: ['IS_L2_BLOCK_CHECKPOINTED'],
        data: { l2BlockNumber: l2BlockNumber.toString(), isCheckpointed },
      };
    },
    examples: [],
  },
];

// --- Define Providers --- //
const polygonProviders: Provider[] = [polygonWalletProvider];

// --- Define Services --- //
const polygonServices: (typeof Service)[] = [PolygonRpcService];

// --- Plugin Definition --- //
export const polygonPlugin: Plugin = {
  name: '@elizaos/plugin-polygon',
  description: 'Plugin for interacting with the Polygon PoS network and staking.',

  // Configuration loaded from environment/character settings
  config: {
    POLYGON_RPC_URL: process.env.POLYGON_RPC_URL,
    ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    POLYGONSCAN_KEY: process.env.POLYGONSCAN_KEY,
  },

  // Initialization logic
  async init(config: Record<string, any>, runtime: IAgentRuntime) {
    logger.info(`Initializing plugin: ${this.name}`);
    try {
      // Validate configuration
      const validatedConfig = await configSchema.parseAsync(config);
      logger.info('Polygon plugin configuration validated successfully.');

      // Store validated config in runtime settings for services/actions/providers to access
      // This assumes runtime has a way to store validated plugin config or settings are global
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (!runtime.getSetting(key)) {
          logger.warn(
            `Setting ${key} was validated but not found via runtime.getSetting. Ensure it is loaded globally before plugin init.`
          );
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid Polygon plugin configuration:', error.errors);
        throw new Error(
          `Invalid Polygon plugin configuration: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`
        );
      }
      logger.error('Error during Polygon plugin initialization:', error);
      throw error;
    }
  },

  // Register components
  actions: polygonActions,
  providers: polygonProviders,
  services: polygonServices,

  // Optional lifecycle methods, models, tests, routes, events
  models: {},
  tests: [],
  routes: [],
  events: {},
};

// Default export for ElizaOS to load
export default polygonPlugin;
