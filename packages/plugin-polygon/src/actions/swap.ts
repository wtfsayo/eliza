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
import {
  createConfig,
  executeRoute,
  type ExtendedChain,
  getRoutes,
  type Route,
  type LiFiStep,
  type ChainKey,
} from '@lifi/sdk';
import { type Chain, polygon as polygonChain, mainnet as ethereumChain } from 'viem/chains';
import {
  createWalletClient,
  http,
  type WalletClient,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
  PublicClient,
  createPublicClient,
  fallback,
  parseAbi,
  type Transport,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

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
    if (!this.chains[k]) throw new Error(`Chain ${k} not supported by WalletProvider`);
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

interface SwapParams {
  chain: string; // e.g., "polygon"
  fromToken: Address; // Address of the token to sell
  toToken: Address; // Address of the token to buy
  amount: string; // Amount of fromToken to sell (in human-readable format, e.g., "1.5")
  slippage?: number; // Optional slippage percentage (e.g., 0.5 for 0.5%)
}

interface Transaction {
  hash: `0x${string}`;
  from: Address;
  to: Address; // Typically the LiFi router or approval address
  value: bigint; // Usually 0 for token swaps, unless fromToken is native
  chainId: number;
  data?: Hex;
  logs?: any[];
  toAmountMin?: string; // From LiFi estimate
  toAmount?: string; // From LiFi estimate
}

const swapTemplate = {
  name: 'Swap Tokens on Polygon',
  description:
    'Generates parameters to swap tokens on Polygon using LiFi. // Respond with a valid JSON object containing the extracted parameters.',
  parameters: {
    type: 'object',
    properties: {
      chain: {
        type: 'string',
        description: 'Blockchain name (e.g., polygon). Default: polygon.',
        default: 'polygon',
      },
      fromToken: { type: 'string', description: 'Address of the token to sell.' },
      toToken: { type: 'string', description: 'Address of the token to buy.' },
      amount: { type: 'string', description: 'Amount of the token to sell (e.g., \"10.5\").' },
      slippage: {
        type: 'number',
        description: 'Optional: Max slippage percentage (e.g., 0.5). Default: 0.5.',
        default: 0.5,
      },
    },
    required: ['fromToken', 'toToken', 'amount'],
  },
};

const tokenDecimalsAbi = parseAbi(['function decimals() view returns (uint8)']);

class PolygonSwapActionRunner {
  private lifiConfig;
  private walletProvider: WalletProvider;

  constructor(walletProvider: WalletProvider) {
    this.walletProvider = walletProvider;
    const extendedChains = Object.values(this.walletProvider.chains).map((chainConfig) => ({
      ...chainConfig,
      key: chainConfig.name.toLowerCase().replace(/\s+/g, '-') as ChainKey,
      chainType: 'EVM',
      coin: chainConfig.nativeCurrency.symbol,
      mainnet: !chainConfig.testnet,
      logoURI: '',
      name: chainConfig.name,
      nativeToken: {
        address: '0x0000000000000000000000000000000000000000',
        chainId: chainConfig.id,
        symbol: chainConfig.nativeCurrency.symbol,
        decimals: chainConfig.nativeCurrency.decimals,
        name: chainConfig.nativeCurrency.name,
        priceUSD: '0',
        logoURI: '',
        coinKey: chainConfig.nativeCurrency.symbol,
      },
      metamask: {
        chainId: `0x${chainConfig.id.toString(16)}`,
        blockExplorerUrls: [chainConfig.blockExplorers?.default?.url || ''],
        chainName: chainConfig.name,
        nativeCurrency: chainConfig.nativeCurrency,
        rpcUrls: [...chainConfig.rpcUrls.default.http],
      },
    }));
    this.lifiConfig = createConfig({ integrator: 'ElizaOS-PolygonSwap', chains: extendedChains });
  }

  private async getTokenDecimals(chain: string, tokenAddress: Address): Promise<number> {
    if (
      tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000'
    ) {
      // Native token, use chain's native currency decimals
      return this.walletProvider.getChainConfigs(chain).nativeCurrency.decimals;
    }
    const publicClient = this.walletProvider.getPublicClient(chain);
    try {
      return await publicClient.readContract({
        address: tokenAddress,
        abi: tokenDecimalsAbi,
        functionName: 'decimals',
      });
    } catch (err: any) {
      logger.warn(
        `Could not fetch decimals for ${tokenAddress} on ${chain}, defaulting to 18. Error: ${err.message}`
      );
      return 18; // Default to 18 if decimals call fails
    }
  }

  async swap(params: SwapParams): Promise<Transaction> {
    const walletClient = this.walletProvider.getWalletClient(params.chain);
    const [fromAddress] = await walletClient.getAddresses();
    const chainConfig = this.walletProvider.getChainConfigs(params.chain);

    const fromTokenDecimals = await this.getTokenDecimals(params.chain, params.fromToken);
    const fromAmountWei = parseUnits(params.amount, fromTokenDecimals).toString();

    const routesRequest = {
      fromChainId: chainConfig.id,
      toChainId: chainConfig.id, // Same chain swap
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      fromAmount: fromAmountWei,
      fromAddress,
      toAddress: fromAddress, // LiFi needs a toAddress for same-chain swaps too
      options: { slippage: (params.slippage || 0.5) / 100, order: 'RECOMMENDED' as const },
    };
    logger.debug('Requesting LiFi swap routes with:', routesRequest);
    const routesResult = await getRoutes(routesRequest);

    if (!routesResult.routes || routesResult.routes.length === 0) {
      logger.error('No LiFi routes found for swapping these tokens.');
      throw new Error('No routes found for this swap.');
    }
    const bestRoute: Route = routesResult.routes[0];
    logger.debug('Executing LiFi swap route:', JSON.stringify(bestRoute, null, 2));

    // Execute the route
    const execution = await executeRoute(walletClient, bestRoute);

    let txHash: `0x${string}` | undefined;
    let toAmountMinFromStep: string | undefined;
    let toAmountFromStep: string | undefined;

    for (const step of execution.steps) {
      const lifiStep = step as LiFiStep;
      toAmountMinFromStep = lifiStep.estimate?.toAmountMin;
      toAmountFromStep = lifiStep.estimate?.toAmount;
      if (step.execution?.process) {
        for (const process of step.execution.process) {
          if (process.txHash) {
            txHash = process.txHash as `0x${string}`;
            logger.info(`Swap transaction hash: ${txHash} on chain ${lifiStep.action.fromChainId}`);
            break;
          }
        }
      }
      if (txHash) break;
    }

    if (!txHash) {
      logger.error('Swap transaction hash not found in LiFi execution result.');
      throw new Error('Swap transaction failed or hash not found.');
    }

    const publicClient = this.walletProvider.getPublicClient(params.chain);
    logger.info(`Waiting for swap transaction receipt: ${txHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    const toAddress =
      (bestRoute.steps[0]?.toolDetails as any)?.routerAddress || bestRoute.toToken.address;
    return {
      hash: txHash,
      from: fromAddress,
      to: toAddress as Address,
      value:
        bestRoute.fromToken.address === params.fromToken &&
        params.fromToken.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
          ? parseUnits(params.amount, fromTokenDecimals)
          : BigInt(0),
      chainId: chainConfig.id,
      logs: receipt.logs,
      data: bestRoute.steps[0]?.transactionRequest?.data as Hex | undefined,
      toAmountMin: toAmountMinFromStep,
      toAmount: toAmountFromStep,
    };
  }
}
// END

export const swapPolygonAction: Action = {
  name: 'SWAP_POLYGON_TOKENS',
  similes: ['POLYGON_SWAP', 'TRADE_POLYGON_TOKENS'],
  description: 'Swaps tokens on Polygon using LiFi.',

  validate: async (runtime: IAgentRuntime, _m: Memory, _s: State | undefined): Promise<boolean> => {
    logger.debug('Validating SWAP_POLYGON_TOKENS action...');
    const checks = [
      runtime.getSetting('WALLET_PUBLIC_KEY'),
      runtime.getSetting('WALLET_PRIVATE_KEY'),
      runtime.getSetting('POLYGON_PLUGINS_ENABLED'),
    ];
    if (checks.some((c) => !c)) {
      logger.error('Required settings (WALLET_*, POLYGON_PLUGINS_ENABLED) not configured.');
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
    logger.info('Handling SWAP_POLYGON_TOKENS for message:', message.id);
    try {
      const walletProvider = await initWalletProvider(runtime);
      const actionRunner = new PolygonSwapActionRunner(walletProvider);
      const prompt = composePromptFromState({
        state,
        template: swapTemplate,
        message: message.content.text,
      });
      const modelResponse = await runtime.useModel(ModelType.LARGE, { prompt });
      let paramsJson;
      try {
        const responseText = modelResponse.text || '';
        const jsonString = responseText.replace(/^```json\n?|\n?```$/g, '');
        paramsJson = JSON.parse(jsonString);
      } catch (e) {
        logger.error('Failed to parse LLM response for swap params:', modelResponse.text, e);
        throw new Error('Could not understand swap parameters.');
      }

      if (!paramsJson.fromToken || !paramsJson.toToken || !paramsJson.amount) {
        throw new Error('Incomplete swap parameters extracted.');
      }

      const swapParams: SwapParams = {
        chain: ((paramsJson.chain as string) || 'polygon').toLowerCase(),
        fromToken: paramsJson.fromToken as Address,
        toToken: paramsJson.toToken as Address,
        amount: paramsJson.amount as string,
        slippage: paramsJson.slippage as number | undefined,
      };

      logger.debug('Swap parameters:', swapParams);
      const txResult = await actionRunner.swap(swapParams);

      // For display, try to format the toAmountMin/toAmount if available
      let toAmountDisplay = 'unknown amount';
      if (txResult.toAmountMin) {
        try {
          const toTokenDecimals = await (actionRunner as any).getTokenDecimals(
            swapParams.chain,
            swapParams.toToken
          );
          toAmountDisplay = `${formatUnits(BigInt(txResult.toAmountMin), toTokenDecimals)} (min)`;
          if (txResult.toAmount) {
            toAmountDisplay = `${formatUnits(BigInt(txResult.toAmount), toTokenDecimals)}`;
          }
        } catch (e) {
          logger.warn('Could not format toAmountMin');
        }
      }

      const successMsg = `Successfully initiated swap of ${swapParams.amount} ${swapParams.fromToken} for (approx) ${toAmountDisplay} ${swapParams.toToken} on ${swapParams.chain}. TxHash: ${txResult.hash}`;
      logger.info(successMsg);

      if (cb) {
        await cb({
          text: successMsg,
          content: { success: true, ...txResult, toAmountDisplay },
          actions: ['SWAP_POLYGON_TOKENS'],
          source: message.content.source,
        });
      }
      return { success: true, ...txResult, toAmountDisplay };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error in SWAP_POLYGON_TOKENS handler:', errMsg, error);
      if (cb) {
        await cb({
          text: `Error swapping tokens: ${errMsg}`,
          actions: ['SWAP_POLYGON_TOKENS'],
          source: message.content.source,
        });
      }
      return { success: false, error: errMsg };
    }
  },
  examples: [
    [
      { role: 'user', content: { text: 'Swap 100 USDC for DAI on Polygon. Max 0.3% slippage.' } },
      undefined,
    ],
  ] as ActionExample[],
};
