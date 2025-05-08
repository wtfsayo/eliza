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
  parseEther,
  type Address,
  type Hex,
  PublicClient,
  createPublicClient,
  fallback,
  formatEther,
  type Transport,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// TODO: Define specific input/output schemas/types based on ElizaOS conventions
// Input might be inferred from message content or structured parameters.
// Output is typically Content object.

// START - Reusable WalletProvider and types (from previous adaptations)
interface ChainConfig extends Chain {
  rpcUrls: Pick<Chain['rpcUrls'], 'default'> & { default: { http: readonly string[] } };
  blockExplorers: Pick<Chain['blockExplorers'], 'default'> & {
    default: { name: string; url: string };
  };
}

class WalletProvider {
  public chains: Record<string, ChainConfig> = {};

  constructor(private runtime: IAgentRuntime) {
    const defaultChains: Record<string, Chain> = {
      polygon: polygonChain,
      ethereum: ethereumChain,
    };
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
    const chainKey = chainName.toLowerCase();
    if (!this.chains[chainKey]) {
      throw new Error(`Chain ${chainName} not supported.`);
    }
    return this.chains[chainKey];
  }

  getWalletClient(chainName: string): WalletClient<Transport, Chain, Account> {
    const privateKey = this.runtime.getSetting('WALLET_PRIVATE_KEY') as `0x${string}` | undefined;
    if (!privateKey || !privateKey.startsWith('0x')) {
      throw new Error('WALLET_PRIVATE_KEY is not set or invalid.');
    }
    const account = privateKeyToAccount(privateKey);
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

interface TransferParams {
  fromChain: string; // Name of the chain, e.g., "polygon"
  toAddress: Address;
  amount: string; // Amount as string, e.g., "1.5" for native currency
  data?: Hex; // Optional data for contract interaction (e.g., ERC20 transfer)
  tokenAddress?: Address; // Optional, for ERC20 transfers, toAddress would be this, data is encoded transfer
}

interface Transaction {
  hash: `0x${string}`;
  from: Address;
  to: Address;
  value: bigint;
  chainId: number;
  data?: Hex;
}

const transferTemplate = {
  name: 'Transfer MATIC or Tokens',
  description:
    'Generates parameters to transfer MATIC (native currency) or execute a token transaction. // Respond with a valid JSON object containing the extracted parameters.',
  parameters: {
    type: 'object',
    properties: {
      fromChain: {
        type: 'string',
        description: 'Blockchain name (e.g., polygon). Default: polygon.',
        default: 'polygon',
      },
      toAddress: { type: 'string', description: 'Recipient address.' },
      amount: {
        type: 'string',
        description:
          'Amount of MATIC (native) to transfer. For ERC20, use \"0\" if value is in data.',
      },
      data: {
        type: 'string',
        description: 'Optional: Hex data for transaction (e.g., ERC20 transfer calldata).',
      },
      tokenAddress: { type: 'string', description: 'Optional: ERC20 token contract address.' },
    },
    required: ['toAddress', 'amount'],
  },
};

class PolygonTransferActionRunner {
  constructor(private walletProvider: WalletProvider) {}

  async transfer(params: TransferParams): Promise<Transaction> {
    logger.debug(`Transferring on ${params.fromChain}: ${params.amount} to ${params.toAddress}`);

    const chainConfig = this.walletProvider.getChainConfigs(params.fromChain);
    const walletClient = this.walletProvider.getWalletClient(params.fromChain);
    const publicClient = this.walletProvider.getPublicClient(params.fromChain);

    let txValue = parseEther(params.amount);
    let txTo = params.toAddress;
    let txData = params.data || '0x';

    // Logic for ERC20 transfer if tokenAddress and data (for transfer calldata) are provided
    // This is a simplified example; robust ERC20 handling would need ABI and proper encoding.
    if (params.tokenAddress && params.data) {
      // For ERC20, the 'to' is the token contract, 'value' is 0 unless the contract is payable for other reasons.
      // The actual recipient is part of params.data (encoded in the transfer function call)
      txTo = params.tokenAddress;
      txValue = parseEther(params.amount); // Could be 0 if value is for native token not ERC20 fee.
      // Amount for ERC20 is usually encoded in txData, params.amount might be confusing here.
      // For now, assume params.amount is for native token value, or 0 if it's purely an ERC20 data call.
      logger.info(
        `ERC20 transfer detected to token ${txTo} with data ${txData}. Ensure recipient is in encoded data.`
      );
    } else if (params.data && params.data !== '0x') {
      logger.info(`Raw transaction detected with data ${params.data}. Value: ${params.amount}`);
    } else {
      logger.info(`Native currency (MATIC) transfer: ${params.amount} to ${params.toAddress}`);
    }

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
        to: txTo,
        value: txValue,
        data: txData as Hex,
        chain: chainConfig, // Explicitly pass chain config
        kzg,
      });

      logger.info(`Transaction sent: ${hash}. Waiting for confirmation...`);
      await publicClient.waitForTransactionReceipt({ hash });
      logger.info(`Transaction ${hash} confirmed on ${params.fromChain}.`);

      return {
        hash,
        from: walletClient.account!.address,
        to: txTo, // This is the contract for ERC20, or recipient for native
        value: txValue,
        data: txData as Hex,
        chainId: chainConfig.id,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Transfer failed on ${params.fromChain}: ${errMsg}`, error);
      throw new Error(`Transfer failed: ${errMsg}`);
    }
  }
}
// END - Reusable WalletProvider and types

export const transferPolygonAction: Action = {
  name: 'TRANSFER_POLYGON_ASSETS', // More specific name
  similes: ['SEND_MATIC', 'TRANSFER_MATIC_POLYGON', 'POLYGON_TOKEN_TRANSFER'],
  description: 'Transfers MATIC (native) or other tokens on the Polygon network.',

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    logger.debug('Validating TRANSFER_POLYGON_ASSETS action...');
    const checks = [
      runtime.getSetting('WALLET_PUBLIC_KEY'),
      runtime.getSetting('WALLET_PRIVATE_KEY'),
      runtime.getSetting('POLYGON_PLUGINS_ENABLED'),
    ];
    if (checks.some((check) => !check)) {
      logger.error(
        'Required settings (WALLET_PUBLIC_KEY, WALLET_PRIVATE_KEY, POLYGON_PLUGINS_ENABLED) are not configured.'
      );
      return false;
    }
    if (
      typeof runtime.getSetting('WALLET_PRIVATE_KEY') !== 'string' ||
      !(runtime.getSetting('WALLET_PRIVATE_KEY') as string).startsWith('0x')
    ) {
      logger.error('WALLET_PRIVATE_KEY is invalid.');
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
    logger.info('Handling TRANSFER_POLYGON_ASSETS for message:', message.id);
    try {
      const walletProvider = await initWalletProvider(runtime);
      const actionRunner = new PolygonTransferActionRunner(walletProvider);

      // Define supported chains for the template context dynamically
      const supportedChains = Object.keys(walletProvider.chains)
        .map((c) => `\"${c}\"`)
        .join(' | ');
      const dynamicTransferTemplate = {
        ...transferTemplate,
        parameters: {
          ...transferTemplate.parameters,
          properties: {
            ...transferTemplate.parameters.properties,
            fromChain: {
              type: 'string',
              description: `The blockchain name (e.g., polygon). Supported: ${supportedChains}. Default is polygon.`,
              default: 'polygon',
            },
          },
        },
      };

      // Use composePromptFromState
      const prompt = composePromptFromState({
        state,
        template: dynamicTransferTemplate,
        message: message.content.text,
      });
      // Use runtime.useModel
      const modelResponse = await runtime.useModel(ModelType.SMALL, { prompt }); // Using SMALL
      let paramsJson;
      try {
        const responseText = modelResponse.text || '';
        const jsonString = responseText.replace(/^```json\n?|\n?```$/g, '');
        paramsJson = JSON.parse(jsonString);
      } catch (e) {
        logger.error('Failed to parse LLM response for transfer params:', modelResponse.text, e);
        throw new Error('Could not understand transfer parameters.');
      }

      if (!paramsJson.toAddress || typeof paramsJson.amount === 'undefined') {
        throw new Error('Missing required transfer parameters (toAddress, amount).');
      }

      const transferParams: TransferParams = {
        fromChain: ((paramsJson.fromChain as string) || 'polygon').toLowerCase(),
        toAddress: paramsJson.toAddress as Address,
        amount: paramsJson.amount as string,
        data: paramsJson.data as Hex | undefined,
        tokenAddress: paramsJson.tokenAddress as Address | undefined,
      };

      logger.debug('Transfer parameters:', transferParams);
      const txResult = await actionRunner.transfer(transferParams);
      const displayAmount = formatEther(txResult.value); // For native token display
      const successMsg = `Successfully transferred ${displayAmount} (value) on ${transferParams.fromChain} to ${txResult.to}${paramsJson.tokenAddress ? ' (token: ' + paramsJson.tokenAddress + ')' : ''}. TxHash: ${txResult.hash}`;
      logger.info(successMsg);

      if (callback) {
        await callback({
          text: successMsg,
          content: {
            success: true,
            hash: txResult.hash,
            amount: displayAmount, // Native currency value displayed
            recipient: paramsJson.toAddress, // Actual intended recipient
            contractAddress: paramsJson.tokenAddress || txResult.to, // Token contract or direct recipient
            chain: transferParams.fromChain,
          },
          actions: ['TRANSFER_POLYGON_ASSETS'],
          source: message.content.source,
        });
      }
      return { success: true, ...txResult, displayAmount };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error in TRANSFER_POLYGON_ASSETS handler:', errMsg, error);
      if (callback) {
        await callback({
          text: `Error transferring assets: ${errMsg}`,
          actions: ['TRANSFER_POLYGON_ASSETS'],
          source: message.content.source,
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      { role: 'user', content: { text: 'Send 10.5 MATIC to 0xRecipientAddress on Polygon.' } },
      undefined,
    ],
    [
      {
        role: 'user',
        content: {
          text: 'Transfer 100 USDC (0xTokenAddress) to 0xRecipient on Polygon. Calldata: 0xData.',
        },
      },
      undefined,
    ],
  ] as ActionExample[],
};
