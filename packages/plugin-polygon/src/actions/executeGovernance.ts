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
import { type Chain, polygon as polygonChain, mainnet as ethereumChain } from 'viem/chains';
import {
  createWalletClient,
  http,
  type WalletClient,
  encodeFunctionData,
  type Address,
  type Hex,
  PublicClient,
  createPublicClient,
  fallback,
  keccak256,
  stringToHex,
  type Transport,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Minimal ABI for OZ Governor execute function
const governorExecuteAbi = [
  {
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'calldatas', type: 'bytes[]' },
      { name: 'descriptionHash', type: 'bytes32' },
    ],
    name: 'execute',
    outputs: [], // Or proposalId depending on version
    stateMutability: 'payable', // Execute can be payable
    type: 'function',
  },
] as const;

// START - Reusable WalletProvider and types
interface ChainConfig extends Chain {
  rpcUrls: Pick<Chain['rpcUrls'], 'default'> & { default: { http: readonly string[] } };
  blockExplorers: Pick<Chain['blockExplorers'], 'default'> & {
    default: { name: string; url: string };
  };
}
class WalletProvider {
  public chains: Record<string, ChainConfig> = {};
  constructor(private runtime: IAgentRuntime) {
    const defaultChains: Record<string, Chain> = { polygon: polygonChain, ethereum: ethereumChain };
    Object.keys(defaultChains).forEach((chainKey) => {
      const baseChain = defaultChains[chainKey];
      const rpcUrlSetting = `RPC_URL_${chainKey.toUpperCase()}`;
      const customRpcUrl = this.runtime.getSetting(rpcUrlSetting) as string;
      const httpUrls = customRpcUrl ? [customRpcUrl] : [...baseChain.rpcUrls.default.http];
      this.chains[chainKey] = {
        ...baseChain,
        rpcUrls: {
          ...baseChain.rpcUrls,
          default: { ...baseChain.rpcUrls.default, http: httpUrls },
        },
        blockExplorers: {
          ...baseChain.blockExplorers,
          default: {
            name: baseChain.blockExplorers?.default?.name ?? '',
            url: baseChain.blockExplorers?.default?.url ?? '',
          },
        },
      } as ChainConfig;
    });
  }
  getChainConfigs(chainName: string): ChainConfig {
    const k = chainName.toLowerCase();
    if (!this.chains[k]) throw new Error(`Chain ${k} not supported`);
    return this.chains[k];
  }
  getWalletClient(chainName: string): WalletClient<Transport, Chain, Account> {
    const pk = this.runtime.getSetting('WALLET_PRIVATE_KEY') as `0x${string}`;
    if (!pk || !pk.startsWith('0x')) throw new Error('WALLET_PRIVATE_KEY invalid');
    const account = privateKeyToAccount(pk);
    const chainConfig = this.getChainConfigs(chainName);
    return createWalletClient({
      account,
      chain: chainConfig,
      transport: http(chainConfig.rpcUrls.default.http[0]),
    });
  }
  getPublicClient(chainName: string): PublicClient<Transport, Chain> {
    const chainConfig = this.getChainConfigs(chainName);
    return createPublicClient({
      chain: chainConfig,
      transport: fallback(chainConfig.rpcUrls.default.http.map((url) => http(url))),
    });
  }
}
async function initWalletProvider(runtime: IAgentRuntime): Promise<WalletProvider> {
  return new WalletProvider(runtime);
}

interface ExecuteGovernanceParams {
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

const executeGovernanceTemplate = {
  name: 'Execute Governance Proposal',
  description:
    'Generates parameters to execute a queued governance proposal. // Respond with a valid JSON object containing the extracted parameters.',
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
        description: 'Array of ETH values (strings) for proposal actions.',
      },
      calldatas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of hex-encoded calldata for each action.',
      },
      description: { type: 'string', description: 'The full text description of the proposal.' },
    },
    required: ['chain', 'governorAddress', 'targets', 'values', 'calldatas', 'description'],
  },
};

class PolygonExecuteGovernanceActionRunner {
  constructor(private walletProvider: WalletProvider) {}

  async execute(params: ExecuteGovernanceParams): Promise<Transaction> {
    const walletClient = this.walletProvider.getWalletClient(params.chain);
    const publicClient = this.walletProvider.getPublicClient(params.chain);
    const chainConfig = this.getChainConfigs(params.chain);

    // Note: The `values` in params.values here are for the Governor.execute() call itself.
    // The actual values for the proposal's actions are part of the proposal, not separate args to execute().
    // Standard OZ Governor execute() is often payable, allowing msg.value if the proposal itself involves ETH transfer from Governor.
    // We assume params.values is for the value sent TO THE GOVERNOR.execute() call. Often 0.
    const executeCallValue =
      params.values.length > 0
        ? params.values.map((v) => BigInt(v)).reduce((a, b) => a + b, BigInt(0))
        : BigInt(0);
    const descriptionHash = keccak256(stringToHex(params.description));

    const txData = encodeFunctionData({
      abi: governorExecuteAbi,
      functionName: 'execute',
      // For OZ Governor, `execute` takes `targets[], values[], calldatas[], descriptionHash`.
      // The `values` here are the proposal's action values, not msg.value for execute itself.
      // This seems to be a misunderstanding in the EVM plugin's `execute` params if it also has a separate `values` field.
      // Let's assume `params.values` are the proposal action values.
      args: [
        params.targets,
        params.values.map((v) => BigInt(v)),
        params.calldatas,
        descriptionHash,
      ],
    });
    logger.debug(
      `Executing proposal on ${params.chain} at governor ${params.governorAddress} with descHash: ${descriptionHash}`
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
        value: executeCallValue, // This is msg.value for the execute() call itself.
        data: txData,
        chain: chainConfig,
        kzg,
      });
      logger.info(`Execute transaction sent. Hash: ${hash}. Waiting for receipt...`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        hash,
        from: walletClient.account!.address,
        to: params.governorAddress,
        value: executeCallValue,
        data: txData,
        chainId: chainConfig.id,
        logs: receipt.logs,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Governance execute failed: ${errMsg}`, error);
      throw new Error(`Governance execute failed: ${errMsg}`);
    }
  }
}
// END

export const executeGovernanceAction: Action = {
  name: 'EXECUTE_GOVERNANCE_POLYGON',
  similes: ['POLYGON_GOV_EXECUTE', 'RUN_POLYGON_PROPOSAL'],
  description: 'Executes a queued governance proposal on Polygon.',
  validate: async (runtime: IAgentRuntime, _m: Memory, _s: State | undefined): Promise<boolean> => {
    logger.debug('Validating EXECUTE_GOVERNANCE_POLYGON action...');
    const checks = [
      runtime.getSetting('WALLET_PUBLIC_KEY'),
      runtime.getSetting('WALLET_PRIVATE_KEY'),
      runtime.getSetting('POLYGON_PLUGINS_ENABLED'),
    ];
    if (checks.some((c) => !c)) {
      logger.error('Required settings not configured.');
      return false;
    }
    if (
      typeof runtime.getSetting('WALLET_PRIVATE_KEY') !== 'string' ||
      !(runtime.getSetting('WALLET_PRIVATE_KEY') as string).startsWith('0x')
    ) {
      logger.error('WALLET_PRIVATE_KEY invalid.');
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
    logger.info('Handling EXECUTE_GOVERNANCE_POLYGON for message:', message.id);
    try {
      const walletProvider = await initWalletProvider(runtime);
      const actionRunner = new PolygonExecuteGovernanceActionRunner(walletProvider);
      const prompt = composePromptFromState({
        state,
        template: executeGovernanceTemplate,
        message: message.content.text,
      });
      const modelResponse = await runtime.useModel(ModelType.LARGE, { prompt });
      let paramsJson;
      try {
        const responseText = modelResponse.text || '';
        const jsonString = responseText.replace(/^```json\n?|\n?```$/g, '');
        paramsJson = JSON.parse(jsonString);
      } catch (e) {
        logger.error('Failed to parse LLM response for execute params:', modelResponse.text, e);
        throw new Error('Could not understand execute parameters.');
      }
      if (
        !paramsJson.chain ||
        !paramsJson.governorAddress ||
        !paramsJson.targets ||
        !paramsJson.values ||
        !paramsJson.calldatas ||
        !paramsJson.description
      ) {
        throw new Error('Incomplete execute parameters extracted.');
      }
      const executeParams: ExecuteGovernanceParams = {
        chain: paramsJson.chain as string,
        governorAddress: paramsJson.governorAddress as Address,
        targets: paramsJson.targets as Address[],
        values: paramsJson.values as string[],
        calldatas: paramsJson.calldatas as Hex[],
        description: paramsJson.description as string,
      };
      logger.debug('Execute governance parameters:', executeParams);
      const txResult = await actionRunner.execute(executeParams);
      const successMsg = `Successfully executed proposal on ${executeParams.chain} for governor ${executeParams.governorAddress} (Desc: "${executeParams.description}"). TxHash: ${txResult.hash}`;
      logger.info(successMsg);
      if (cb) {
        await cb({
          text: successMsg,
          content: { success: true, ...txResult },
          actions: ['EXECUTE_GOVERNANCE_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: true, ...txResult };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error in EXECUTE_GOVERNANCE_POLYGON handler:', errMsg, error);
      if (cb) {
        await cb({
          text: `Error executing proposal: ${errMsg}`,
          actions: ['EXECUTE_GOVERNANCE_POLYGON'],
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
          text: "Execute the queued proposal 'Test Prop E1' on Polygon governor 0xGov. Targets:[0xT1], Values:[0], Calldatas:[0xCD1].",
        },
      },
      undefined,
    ],
  ] as ActionExample[],
};
