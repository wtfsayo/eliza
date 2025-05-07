import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from '@elizaos/core';

/**
 * Attempts to load a plugin module using Node.js module resolution.
 * This will automatically handle:
 * - Local node_modules
 * - Global node_modules
 * - Monorepo packages (through proper package.json and workspace configuration)
 * - Package entry points
 *
 * If `directory` is provided, it will first try to load from
 * `<directory>/node_modules/<repository>`.
 *
 * @param repository - The plugin repository/package name to load.
 * @param directory  - Optional base directory to resolve the plugin from.
 * @returns The loaded plugin module or null if loading fails.
 */
export async function loadPluginModule(
  repository: string,
  directory?: string
): Promise<any | null> {
  logger.debug(`Attempting to load plugin module: ${repository}`);

  try {
    let specifier = repository;

    if (directory) {
      // Resolve to <directory>/node_modules/<repository>
      const moduleDir = path.resolve(directory, 'node_modules', repository);
      // Convert to file:// URL so import() can load it
      specifier = pathToFileURL(moduleDir).href;
      logger.debug(`Resolving plugin from directory: ${specifier}`);
    }

    const module = await import(specifier);
    logger.debug(`Successfully loaded plugin '${repository}'`);
    return module;
  } catch (error) {
    logger.warn(
      `Failed to load plugin module '${repository}': ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}
