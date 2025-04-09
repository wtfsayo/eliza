import { IAgentRuntime, Memory, State, Provider as ProviderFromTypes } from './types';
import { toV2State } from './state';

// Define equivalent to ProviderV2 here to avoid external dependencies
interface ProviderV2 {
  /** Provider name */
  name: string;

  /** Description of the provider */
  description?: string;

  /** Whether the provider is dynamic */
  dynamic?: boolean;

  /** Position of the provider in the provider list */
  position?: number;

  /** Whether the provider is private */
  private?: boolean;

  /** Data retrieval function */
  get: (runtime: any, message: any, state: any) => Promise<any>;
}

/**
 * Provider for external data/services
 * This is a v1 compatibility wrapper for v2 Provider
 */
export type Provider = ProviderFromTypes;

/**
 * Converts v2 Provider to v1 compatible Provider
 */
export function fromV2Provider(providerV2: ProviderV2): Provider {
  return {
    name: providerV2.name,
    description: providerV2.description,
    dynamic: providerV2.dynamic,
    position: providerV2.position,
    private: providerV2.private,
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
      // Convert v1 state to v2 state if provided
      const stateV2 = state ? toV2State(state) : undefined;

      try {
        // Call the v2 provider with transformed parameters
        // Note: There are type mismatches between v1 and v2 runtime
        // This is handled at runtime by duck typing, but TypeScript complains
        return await providerV2.get(runtime as any, message as any, stateV2 as any);
      } catch (error) {
        console.error(`Error in v2 provider ${providerV2.name}:`, error);
        throw error;
      }
    },
  };
}

/**
 * Converts v1 Provider to v2 Provider
 */
export function toV2Provider(provider: Provider): ProviderV2 {
  return {
    name: provider.name || 'unnamed-provider',
    description: provider.description,
    dynamic: provider.dynamic,
    position: provider.position,
    private: provider.private,
    get: async (runtime: any, message: any, state: any) => {
      try {
        // Call the v1 provider directly
        return await provider.get(runtime, message, state);
      } catch (error) {
        console.error(`Error in v1 provider ${provider.name || 'unnamed'}:`, error);
        throw error;
      }
    },
  };
}
