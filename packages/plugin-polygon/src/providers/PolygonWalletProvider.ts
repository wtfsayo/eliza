import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  formatUnits,
  http,
  publicActions,
  walletActions,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  type IAgentRuntime,
  type Provider,
  type Memory,
  type State,
  elizaLogger,
  type ProviderResult,
} from '@elizaos/core';
import type {
  Address,
  WalletClient,
  PublicClient,
  Chain,
  HttpTransport,
  Account,
  PrivateKeyAccount,
  TestClient,
} from 'viem';
import * as viemChains from 'viem/chains';
import { PhalaDeriveKeyProvider } from '@elizaos/plugin-tee';
import NodeCache from 'node-cache';
import * as path from 'node:path';

import type { SupportedChain } from '../types';

export class WalletProvider {
  private cache: NodeCache;
  private cacheKey = 'evm/wallet';
  private currentChain: SupportedChain = 'mainnet';
  private CACHE_EXPIRY_SEC = 5;
  chains: Record<string, Chain> = { ...viemChains };
  account: PrivateKeyAccount;

  constructor(
    accountOrPrivateKey: PrivateKeyAccount | `0x${string}`,
    chains?: Record<string, Chain>
  ) {
    this.setAccount(accountOrPrivateKey);
    this.setChains(chains);

    if (chains && Object.keys(chains).length > 0) {
      this.setCurrentChain(Object.keys(chains)[0] as SupportedChain);
    }

    this.cache = new NodeCache({ stdTTL: this.CACHE_EXPIRY_SEC });
  }

  getAddress(): Address {
    return this.account.address;
  }

  getCurrentChain(): Chain {
    return this.chains[this.currentChain];
  }

  getPublicClient(
    chainName: SupportedChain
  ): PublicClient<HttpTransport, Chain, Account | undefined> {
    const transport = this.createHttpTransport(chainName);

    const publicClient = createPublicClient({
      chain: this.chains[chainName],
      transport,
    });
    return publicClient;
  }

  getWalletClient(chainName: SupportedChain): WalletClient {
    const transport = this.createHttpTransport(chainName);

    const walletClient = createWalletClient({
      chain: this.chains[chainName],
      transport,
      account: this.account,
    });

    return walletClient;
  }

  getTestClient(): TestClient {
    return createTestClient({
      chain: viemChains.hardhat,
      mode: 'hardhat',
      transport: http(),
    })
      .extend(publicActions)
      .extend(walletActions);
  }

  getChainConfigs(chainName: SupportedChain): Chain {
    const chain = viemChains[chainName];

    if (!chain?.id) {
      throw new Error('Invalid chain name');
    }

    return chain;
  }

  async getWalletBalance(): Promise<string | null> {
    try {
      const client = this.getPublicClient(this.currentChain);
      const balance = await client.getBalance({
        address: this.account.address,
      });
      const balanceFormatted = formatUnits(balance, 18);
      elizaLogger.log('Wallet balance cached for chain: ', this.currentChain);
      return balanceFormatted;
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      return null;
    }
  }

  async getWalletBalanceForChain(chainName: SupportedChain): Promise<string | null> {
    try {
      const client = this.getPublicClient(chainName);
      const balance = await client.getBalance({
        address: this.account.address,
      });
      return formatUnits(balance, 18);
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      return null;
    }
  }

  addChain(chain: Record<string, Chain>) {
    this.setChains(chain);
  }

  switchChain(chainName: SupportedChain, customRpcUrl?: string) {
    if (!this.chains[chainName]) {
      const chain = WalletProvider.genChainFromName(chainName, customRpcUrl);
      this.addChain({ [chainName]: chain });
    }
    this.setCurrentChain(chainName);
  }

  private setAccount = (accountOrPrivateKey: PrivateKeyAccount | `0x${string}`) => {
    if (typeof accountOrPrivateKey === 'string') {
      this.account = privateKeyToAccount(accountOrPrivateKey);
    } else {
      this.account = accountOrPrivateKey;
    }
  };

  private setChains = (chains?: Record<string, Chain>) => {
    if (!chains) {
      return;
    }
    for (const chain of Object.keys(chains)) {
      this.chains[chain] = chains[chain];
    }
  };

  private setCurrentChain = (chain: SupportedChain) => {
    this.currentChain = chain;
  };

  private createHttpTransport = (chainName: SupportedChain) => {
    const chain = this.chains[chainName];

    if (chain.rpcUrls.custom) {
      return http(chain.rpcUrls.custom.http[0]);
    }
    return http(chain.rpcUrls.default.http[0]);
  };

  static genChainFromName(chainName: string, customRpcUrl?: string | null): Chain {
    const baseChain = viemChains[chainName];

    if (!baseChain?.id) {
      throw new Error('Invalid chain name');
    }

    const viemChain: Chain = customRpcUrl
      ? {
          ...baseChain,
          rpcUrls: {
            ...baseChain.rpcUrls,
            custom: {
              http: [customRpcUrl],
            },
          },
        }
      : baseChain;

    return viemChain;
  }
}

const genChainsFromRuntime = (runtime: IAgentRuntime): Record<string, Chain> => {
  const chainNames = (runtime.character.settings.chains?.evm as SupportedChain[]) || [];
  const chains: Record<string, Chain> = {};

  for (const chainName of chainNames) {
    const rpcUrl = runtime.getSetting(`ETHEREUM_PROVIDER_${chainName.toUpperCase()}`);
    const chain = WalletProvider.genChainFromName(chainName, rpcUrl);
    chains[chainName] = chain;
  }

  const mainnet_rpcurl = runtime.getSetting('EVM_PROVIDER_URL');
  if (mainnet_rpcurl) {
    const chain = WalletProvider.genChainFromName('mainnet', mainnet_rpcurl);
    chains['mainnet'] = chain;
  }

  return chains;
};

export const initWalletProvider = async (runtime: IAgentRuntime) => {
  const teeMode = runtime.getSetting('TEE_MODE') || 'OFF';

  const chains = genChainsFromRuntime(runtime);

  if (teeMode !== 'OFF') {
    const walletSecretSalt = runtime.getSetting('WALLET_SECRET_SALT');
    if (!walletSecretSalt) {
      throw new Error('WALLET_SECRET_SALT required when TEE_MODE is enabled');
    }

    const deriveKeyProvider = new PhalaDeriveKeyProvider(teeMode);
    const deriveKeyResult = await deriveKeyProvider.deriveEcdsaKeypair(
      walletSecretSalt,
      'evm',
      runtime.agentId
    );
    runtime;
    return new WalletProvider(deriveKeyResult.keypair, chains);
  } else {
    const privateKey = runtime.getSetting('EVM_PRIVATE_KEY') as `0x${string}`;
    if (!privateKey) {
      throw new Error('EVM_PRIVATE_KEY is missing');
    }
    return new WalletProvider(privateKey, chains);
  }
};

export const evmWalletProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, state?: State): Promise<ProviderResult> {
    try {
      const walletProvider = await initWalletProvider(runtime);
      const address = walletProvider.getAddress();
      const balance = await walletProvider.getWalletBalance();
      const chain = walletProvider.getCurrentChain();
      const agentName = state?.agentName || 'The agent';
      const resultText = `${agentName}'s EVM Wallet Address: ${address}\nBalance: ${balance} ${chain.nativeCurrency.symbol}\nChain ID: ${chain.id}, Name: ${chain.name}`;
      return { text: resultText };
    } catch (error) {
      console.error('Error in EVM wallet provider:', error);
      const errorText = error instanceof Error ? error.message : String(error);
      return { text: `Error in EVM wallet provider: ${errorText}` };
    }
  },
  name: '',
};
