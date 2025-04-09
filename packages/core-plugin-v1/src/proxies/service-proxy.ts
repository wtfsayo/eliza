/**
 * DEPRECATED - Service Proxy - Maps V1 services to V2 services
 *
 * This file has been replaced by service-adapter-factory.ts and is kept
 * for backward compatibility only. It simply redirects to the new implementation.
 */

import { ServiceType as V1ServiceType, Service as V1Service } from '../types';
import { IAgentRuntime as V2IAgentRuntime } from '@elizaos/core-plugin-v2';
import { CompatAgentRuntime } from '../runtime';
import { createV1ServiceAdapter } from './service-adapter-factory';

/**
 * Maps a V1 service type to a V2 service type
 * @deprecated Use service-adapter-factory.ts instead
 */
export function mapServiceType(v1Type: V1ServiceType): string {
  console.warn(
    '[Compat Layer] mapServiceType is deprecated. Use service-adapter-factory.ts instead.'
  );
  return v1Type;
}

/**
 * Creates a V1 service proxy that delegates to a V2 service
 * @deprecated Use createV1ServiceAdapter from service-adapter-factory.ts instead
 */
export function createServiceProxy(
  compatRuntime: CompatAgentRuntime,
  serviceType: V1ServiceType,
  v2Runtime: V2IAgentRuntime
): V1Service {
  console.warn(
    '[Compat Layer] createServiceProxy is deprecated. Use createV1ServiceAdapter from service-adapter-factory.ts instead.'
  );

  // Redirect to the new implementation
  const service = createV1ServiceAdapter(serviceType, compatRuntime, v2Runtime);

  if (!service) {
    // Create a basic proxy if no specialized adapter exists
    return {
      serviceType: serviceType,
      initialize: async () => {
        console.log(`[Compat Layer] Initializing generic service proxy for ${serviceType}`);
        return Promise.resolve();
      },
    };
  }

  return service;
}
