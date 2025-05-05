import {
  type Provider,
  type ProviderResult,
  IAgentRuntime,
  type Memory,
  type State,
  logger,
} from '@elizaos/core';
import { Wallet } from 'ethers'; // Or appropriate wallet class

// Define the context provided by this provider
export interface IPolygonWalletContext {
  address: string;
  // Potentially add signTransaction, sendTransaction methods later
  // May also include provider instances for L1/L2
}

/**
 * Provider object conforming to the ElizaOS Provider interface.
 * It retrieves the private key from runtime settings within the `get` method.
 */
export const polygonWalletProvider: Provider = {
  name: 'polygonWallet',
  description:
    "Provides the agent's Polygon wallet address derived from the configured private key.",

  get: async (
    runtime: IAgentRuntime,
    _message?: Memory,
    _state?: State | undefined
  ): Promise<ProviderResult> => {
    // !!! IMPORTANT: Handle private key securely.
    const privateKey = runtime.getSetting('PRIVATE_KEY');
    if (!privateKey) {
      logger.error('PRIVATE_KEY not found in settings for PolygonWalletProvider.');
      // Return a result indicating failure
      return {
        text: 'Error: Wallet private key is not configured.',
        data: { address: '0xConfigurationError' } as IPolygonWalletContext,
        values: { configured: false },
      };
    }

    let address = '0xErrorDerivingAddress';
    let derived = false;
    let walletContext: IPolygonWalletContext = { address };
    try {
      const wallet = new Wallet(privateKey);
      address = wallet.address;
      walletContext = { address };
      derived = true;
      logger.debug(`Derived address ${address} in PolygonWalletProvider`);
    } catch (error) {
      logger.error('Failed to derive address from private key in PolygonWalletProvider:', error);
      walletContext = { address: '0xDerivationError' };
    }

    // Return the ProviderResult object including context in `data`
    return {
      // Textual representation (optional)
      text: derived ? `Agent Wallet Address: ${address}` : 'Error deriving wallet address.',
      // Structured data context
      data: walletContext,
      // Simple key-value pairs (optional)
      values: {
        derivedSuccessfully: derived,
      },
    };
  },
};
