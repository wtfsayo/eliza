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
  type TemplateType,
} from '@elizaos/core';
import { encodeFunctionData, type Address, type Hex, type Chain } from 'viem';
import { WalletProvider, initWalletProvider } from '../providers/PolygonWalletProvider';

// Minimal ABI for OZ Governor castVote function
const governorVoteAbi = [
  {
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'support', type: 'uint8' }, // 0 = Against, 1 = For, 2 = Abstain
    ],
    name: 'castVote',
    outputs: [], // Typically returns a boolean success or nothing, tx receipt is key
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface VoteParams {
  chain: string;
  governorAddress: Address;
  proposalId: string; // string for LLM, convert to BigInt
  support: number; // 0, 1, or 2
  reason?: string; // Optional, if using castVoteWithReason
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

const voteGovernanceTemplateObj = {
  name: 'Vote on Governance Proposal',
  description:
    'Generates parameters to cast a vote on a governance proposal. // Respond with a valid JSON object containing the extracted parameters.',
  parameters: {
    type: 'object',
    properties: {
      chain: { type: 'string', description: 'Blockchain name (e.g., polygon).' },
      governorAddress: { type: 'string', description: 'Address of the Governor.' },
      proposalId: { type: 'string', description: 'ID of the proposal.' },
      support: {
        type: 'integer',
        enum: [0, 1, 2],
        description: 'Vote: 0=Against, 1=For, 2=Abstain.',
      },
    },
    required: ['chain', 'governorAddress', 'proposalId', 'support'],
  },
} as const;

class PolygonVoteGovernanceActionRunner {
  constructor(private walletProvider: WalletProvider) {}

  async vote(params: VoteParams): Promise<Transaction> {
    const walletClient = this.walletProvider.getWalletClient(params.chain);
    const publicClient = this.walletProvider.getPublicClient(params.chain);
    const chainConfig = this.walletProvider.getChainConfigs(params.chain);

    const proposalIdBigInt = BigInt(params.proposalId);
    // Ensure support is uint8 compatible
    const supportUint8 = params.support as 0 | 1 | 2;

    const txData = encodeFunctionData({
      abi: governorVoteAbi,
      functionName: 'castVote',
      args: [proposalIdBigInt, supportUint8],
    });

    logger.debug(
      `Voting on proposal ${params.proposalId} with support ${params.support} on ${params.chain} at governor ${params.governorAddress}`
    );

    try {
      // Add missing kzg property
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

      logger.info(`Vote transaction sent. Hash: ${hash}. Waiting for receipt...`);
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
      logger.error(`Governance vote failed: ${errMsg}`, error);
      throw new Error(`Governance vote failed: ${errMsg}`);
    }
  }
}

export const voteGovernanceAction: Action = {
  name: 'VOTE_GOVERNANCE_POLYGON',
  similes: ['CAST_POLYGON_VOTE', 'VOTE_ON_POLYGON_PROPOSAL'],
  description: 'Casts a vote on an existing governance proposal.',

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    logger.debug('Validating VOTE_GOVERNANCE_POLYGON action...');
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
    _options: any,
    callback: HandlerCallback | undefined,
    _responses: Memory[] | undefined
  ) => {
    logger.info('Handling VOTE_GOVERNANCE_POLYGON for message:', message.id);
    try {
      const walletProvider = await initWalletProvider(runtime);
      const actionRunner = new PolygonVoteGovernanceActionRunner(walletProvider);

      const prompt = composePromptFromState({
        state,
        template: voteGovernanceTemplateObj as TemplateType,
        message: message.content.text,
      });
      const modelResponse = await runtime.useModel(ModelType.SMALL, { prompt });
      let paramsJson;
      try {
        const jsonString = (modelResponse || '').replace(/^```json(\r?\n)?|(\r?\n)?```$/g, '');
        paramsJson = JSON.parse(jsonString);
      } catch (e) {
        logger.error('Failed to parse LLM response for vote params:', modelResponse, e);
        throw new Error('Could not understand vote parameters.');
      }

      if (
        !paramsJson.chain ||
        !paramsJson.governorAddress ||
        !paramsJson.proposalId ||
        typeof paramsJson.support === 'undefined'
      ) {
        throw new Error('Missing required vote parameters.');
      }

      const voteParams: VoteParams = {
        chain: paramsJson.chain as string,
        governorAddress: paramsJson.governorAddress as Address,
        proposalId: paramsJson.proposalId as string,
        support: paramsJson.support as number,
      };

      logger.debug('Vote governance parameters:', voteParams);
      const txResult = await actionRunner.vote(voteParams);
      const successMsg = `Successfully voted on proposal ${voteParams.proposalId} on ${voteParams.chain} with support ${voteParams.support}. TxHash: ${txResult.hash}`;
      logger.info(successMsg);

      if (callback) {
        await callback({
          text: successMsg,
          content: { success: true, ...txResult },
          actions: ['VOTE_GOVERNANCE_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: true, ...txResult };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error in VOTE_GOVERNANCE_POLYGON handler:', errMsg, error);
      if (callback) {
        await callback({
          text: `Error voting on proposal: ${errMsg}`,
          actions: ['VOTE_GOVERNANCE_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      { role: 'user', content: { text: 'Vote FOR proposal 77 on Polygon governor 0xGovAddress.' } },
      undefined,
    ],
  ] as ActionExample[],
};
