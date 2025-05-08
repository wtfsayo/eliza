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
  type LiFiStep,
  type Route,
  type ChainKey,
} from '@lifi/sdk';
import {
  createWalletClient,
  http,
  type WalletClient,
  parseEther,
  type PublicClient,
  createPublicClient,
  fallback,
  type Address,
  type Hex,
  type Transport,
  type Account,
  type Chain,
} from 'viem';
import { WalletProvider, initWalletProvider } from '../providers/PolygonWalletProvider';

interface BridgeParams {
  fromChain: string;
  toChain: string;
  fromToken: Address;
  toToken: Address;
  amount: string;
  toAddress?: Address;
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

const bridgeTemplate = {
  name: 'Bridge Tokens',
  description:
    'Bridge tokens between different EVM chains using LiFi. // Respond with a valid JSON object containing the extracted parameters.',
  parameters: {
    type: 'object',
    properties: {
      fromChain: {
        type: 'string',
        description: 'Name of the source chain (e.g., Ethereum, Polygon)',
      },
      toChain: {
        type: 'string',
        description: 'Name of the destination chain (e.g., Polygon, Arbitrum)',
      },
      fromToken: {
        type: 'string',
        description: 'Address of the token to bridge from source chain',
      },
      toToken: {
        type: 'string',
        description: 'Address of the token to receive on destination chain',
      },
      amount: { type: 'string', description: 'Amount of tokens to bridge (e.g., \"10.5\")' },
      toAddress: {
        type: 'string',
        description: 'Optional: Address on destination chain. Defaults to sender.',
      },
    },
    required: ['fromChain', 'toChain', 'fromToken', 'toToken', 'amount'],
  },
};

class PolygonBridgeActionRunner {
  private config;
  private walletProvider: WalletProvider;

  constructor(walletProvider: WalletProvider) {
    this.walletProvider = walletProvider;
    const extendedChains = Object.values(this.walletProvider.chains).map((chainConfig: Chain) => {
      const rpcUrls = chainConfig.rpcUrls.custom?.http || chainConfig.rpcUrls.default.http;
      const blockExplorerUrl = chainConfig.blockExplorers?.default?.url || '';

      return {
        ...chainConfig,
        key: (chainConfig.network ||
          chainConfig.name.toLowerCase().replace(/\s+/g, '-')) as ChainKey,
        chainType: 'EVM',
        coin: chainConfig.nativeCurrency.symbol,
        mainnet: !chainConfig.testnet,
        logoURI: '',
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
          blockExplorerUrls: blockExplorerUrl ? [blockExplorerUrl] : [],
          chainName: chainConfig.name,
          nativeCurrency: chainConfig.nativeCurrency,
          rpcUrls: rpcUrls.slice(),
        },
      } as ExtendedChain;
    });

    this.config = createConfig({ integrator: 'ElizaOS-PolygonPlugin', chains: extendedChains });
  }

  async bridge(params: BridgeParams): Promise<Transaction> {
    const walletClient: WalletClient = this.walletProvider.getWalletClient(params.fromChain);
    const publicClient: PublicClient = this.walletProvider.getPublicClient(params.fromChain);
    const [fromAddress] = await walletClient.getAddresses();
    const fromChainConfig = this.walletProvider.getChainConfigs(params.fromChain);
    const toChainConfig = this.walletProvider.getChainConfigs(params.toChain);
    const fromChainId = fromChainConfig.id;
    const toChainId = toChainConfig.id;
    const routesRequest = {
      fromChainId,
      toChainId,
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      fromAmount: parseEther(params.amount).toString(),
      fromAddress,
      toAddress: params.toAddress || fromAddress,
    };
    logger.debug('Requesting LiFi routes with:', routesRequest);
    const routesResult = await getRoutes(routesRequest);
    if (!routesResult.routes || routesResult.routes.length === 0) {
      throw new Error('No routes found to bridge.');
    }
    const bestRoute: Route = routesResult.routes[0];
    logger.debug('Executing LiFi route:', JSON.stringify(bestRoute, null, 2));
    const execution = await executeRoute(walletClient as any, bestRoute);
    let txHash: `0x${string}` | undefined;
    for (const step of execution.steps) {
      const lifiStep = step as LiFiStep;
      if (lifiStep.execution?.process) {
        for (const process of lifiStep.execution.process) {
          if (process.txHash) {
            txHash = process.txHash as `0x${string}`;
            logger.info(`Tx hash found: ${txHash} on chain ${lifiStep.action.fromChainId}`);
            break;
          }
        }
      }
      if (txHash) break;
    }
    if (!txHash) {
      throw new Error('Bridge tx hash not found.');
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return {
      hash: txHash,
      from: fromAddress,
      to: (bestRoute.steps[0]?.action?.toAddress || '0x') as Address,
      value: parseEther(params.amount),
      chainId: fromChainId,
      logs: receipt.logs as any[],
    };
  }
}

export const bridgeDepositAction: Action = {
  name: 'BRIDGE_DEPOSIT_POLYGON',
  similes: ['POLYGON_BRIDGE_FUNDS', 'MOVE_ETH_TO_POLYGON_LIFI'],
  description: 'Initiates a deposit/bridge using LiFi.',
  validate: async (runtime: IAgentRuntime, _m: Memory, _s: State | undefined): Promise<boolean> => {
    logger.debug('Validating BRIDGE_DEPOSIT_POLYGON...');
    const checks = [
      runtime.getSetting('WALLET_PRIVATE_KEY'),
      runtime.getSetting('POLYGON_PLUGINS_ENABLED'),
    ];
    if (checks.some((check) => !check)) {
      logger.error('Required settings (WALLET_PRIVATE_KEY, POLYGON_PLUGINS_ENABLED) missing.');
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
    logger.info('Handling BRIDGE_DEPOSIT_POLYGON for:', message.id);
    try {
      const walletProvider = await initWalletProvider(runtime);
      const actionRunner = new PolygonBridgeActionRunner(walletProvider);
      const prompt = composePromptFromState({
        state,
        template: bridgeTemplate,
        message: message.content.text,
      });
      const modelResponse = await runtime.useModel(ModelType.LARGE, { prompt });
      let paramsJson;
      try {
        const responseText = modelResponse.text || '';
        const jsonString = responseText.replace(/^```json\n?|\n?```$/g, '');
        paramsJson = JSON.parse(jsonString);
      } catch (e) {
        logger.error('Failed to parse LLM response for bridge params:', modelResponse.text, e);
        throw new Error('Could not understand bridge parameters.');
      }
      if (
        !paramsJson.fromChain ||
        !paramsJson.toChain ||
        !paramsJson.fromToken ||
        !paramsJson.toToken ||
        !paramsJson.amount
      ) {
        throw new Error('Incomplete bridge parameters extracted.');
      }
      const bridgeOptions: BridgeParams = {
        fromChain: paramsJson.fromChain,
        toChain: paramsJson.toChain,
        fromToken: paramsJson.fromToken as Address,
        toToken: paramsJson.toToken as Address,
        amount: paramsJson.amount,
        toAddress: paramsJson.toAddress as Address | undefined,
      };
      logger.debug('Parsed bridge options:', bridgeOptions);
      const bridgeResp = await actionRunner.bridge(bridgeOptions);
      const successMessage = `Initiated bridge: ${bridgeOptions.amount} token from ${bridgeOptions.fromChain} to ${bridgeOptions.toChain}. TxHash: ${bridgeResp.hash}`;
      logger.info(successMessage);
      if (cb) {
        await cb({
          text: successMessage,
          content: { success: true, hash: bridgeResp.hash },
          actions: ['BRIDGE_DEPOSIT_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: true, hash: bridgeResp.hash };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('BRIDGE_DEPOSIT_POLYGON handler error:', errMsg, error);
      if (cb) {
        await cb({
          text: `Error bridging: ${errMsg}`,
          actions: ['BRIDGE_DEPOSIT_POLYGON'],
          source: message.content.source,
        });
      }
      return { success: false, error: errMsg };
    }
  },
  examples: [
    [
      { role: 'user', content: { text: 'Bridge 0.5 WETH from Polygon to Ethereum mainnet.' } },
      undefined,
    ],
    [
      {
        role: 'user',
        content: { text: 'Move 100 USDC from Arbitrum to Polygon, send it to 0x123...' },
      },
      undefined,
    ],
  ] as ActionExample[],
};
