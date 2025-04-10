import { CompatAgentRuntime } from '../runtime';
import { Service as V1Service, ServiceType as V1ServiceType } from '../types';
import { ServiceCompatManager, determineServiceType } from './service-adapter';

/**
 * Factory class for creating service adapters between V1 and V2 service implementations
 * This provides a centralized place for creating and registering service adapters
 */
export class ServiceAdapterFactory {
  /**
   * Registers standard service adapters for the compatibility runtime
   * @param runtime The compatibility runtime
   */
  static registerStandardAdapters(runtime: CompatAgentRuntime): void {
    // Check if service manager already exists
    if ((runtime as any)._serviceManager) {
      console.log(`[Compat Layer] Service manager already initialized on runtime`);
      return;
    }

    // Create a service compatibility manager for the runtime
    const serviceManager = new ServiceCompatManager(runtime);

    // Store the service manager on the runtime for future use
    (runtime as any)._serviceManager = serviceManager;
  }

  /**
   * Gets a service adapter for the given service type
   * @param runtime The compatibility runtime
   * @param serviceType The V1 service type
   * @returns The service adapter or null if not available
   */
  static getServiceAdapter<T extends V1Service>(
    runtime: CompatAgentRuntime,
    serviceType: V1ServiceType
  ): T | null {
    // Get the service manager from the runtime
    const serviceManager = (runtime as any)._serviceManager as ServiceCompatManager;
    if (!serviceManager) {
      console.error(`[Compat Layer] Service manager not initialized on runtime`);
      return null;
    }

    // Get the service adapter from the manager
    return serviceManager.getService<T>(serviceType);
  }

  /**
   * Registers a V1 service with the compatibility runtime
   * @param runtime The compatibility runtime
   * @param service The V1 service to register
   * @returns A promise that resolves when the service is registered
   */
  static async registerAdapter(runtime: CompatAgentRuntime, service: V1Service): Promise<void> {
    // Get the service manager from the runtime
    const serviceManager = (runtime as any)._serviceManager as ServiceCompatManager;
    if (!serviceManager) {
      console.error(`[Compat Layer] Service manager not initialized on runtime`);
      return;
    }

    // Initialize the service first if it has an initialize method
    if (typeof service.initialize === 'function') {
      await service.initialize(runtime);
    }

    // Register the service with the manager
    serviceManager.registerService(determineServiceType(service), service);
  }
}
