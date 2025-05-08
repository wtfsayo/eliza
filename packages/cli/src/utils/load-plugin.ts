import { logger } from '@elizaos/core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

interface PackageJson {
  module?: string;
  main?: string;
  version?: string;
}

interface ImportStrategy {
  name: string;
  tryImport: (repository: string) => Promise<{ module: any; packageVersion?: string } | null>;
}

const DEFAULT_ENTRY_POINT = 'dist/index.js';

/**
 * Get the global node_modules path based on Node.js installation
 */
function getGlobalNodeModulesPath(): string {
  // process.execPath gives us the path to the node executable
  const nodeDir = path.dirname(process.execPath);

  if (process.platform === 'win32') {
    // On Windows, node_modules is typically in the same directory as node.exe
    return path.join(nodeDir, 'node_modules');
  } else {
    // On Unix systems, we go up one level from bin directory
    return path.join(nodeDir, '..', 'lib', 'node_modules');
  }
}

/**
 * Helper function to resolve a path within node_modules
 */
function resolveNodeModulesPath(repository: string, ...segments: string[]): string {
  return path.resolve(process.cwd(), 'node_modules', repository, ...segments);
}

/**
 * Helper function to read and parse package.json
 */
async function readPackageJson(packageJsonPath: string): Promise<PackageJson | null> {
  try {
    if (fs.existsSync(packageJsonPath)) {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    }
  } catch (error) {
    logger.debug(`Failed to read package.json from '${packageJsonPath}':`, error);
  }
  return null;
}

/**
 * Finds the package.json file by traversing up from a given directory.
 */
function findPackageJsonPath(startPath: string): string | null {
  let currentDir = fs.lstatSync(startPath).isFile() ? path.dirname(startPath) : startPath;
  while (true) {
    const potentialPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(potentialPath)) {
      return potentialPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached the root
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

/**
 * Attempts to import a module from a given path and logs the outcome.
 */
async function tryImporting(
  importPath: string,
  strategy: string,
  repository: string
): Promise<{ module: any; packageVersion?: string } | null> {
  try {
    const module = await import(importPath);
    logger.debug(`Successfully loaded plugin '${repository}' using ${strategy} (${importPath})`);

    let packageVersion: string | undefined;
    try {
      // Attempt to resolve the actual file path of the imported module to find its package.json
      // This is more reliable than assuming repository name is the folder name in node_modules
      const require = createRequire(import.meta.url); // Use createRequire for ESM context
      const resolvedModulePath = require.resolve(importPath); // Resolve the *imported* path

      if (resolvedModulePath) {
        const packageJsonPath = findPackageJsonPath(resolvedModulePath);
        if (packageJsonPath) {
          const packageJsonData = await readPackageJson(packageJsonPath);
          packageVersion = packageJsonData?.version;
          if (packageVersion) {
            logger.debug(
              `Found version ${packageVersion} for '${repository}' from ${packageJsonPath}`
            );
          }
        }
      }
    } catch (resolveError) {
      logger.debug(
        `Could not resolve module path or find package.json for '${repository}' after import: ${resolveError}`
      );
      // Fallback: try to find package.json based on repository name if direct resolution failed
      // This might be useful if 'repository' is a direct path or something not directly resolvable as a package name
      const packageJsonPath = findPackageJsonPath(repository); // Try with original repository string
      if (packageJsonPath) {
        const packageJsonData = await readPackageJson(packageJsonPath);
        packageVersion = packageJsonData?.version;
        if (packageVersion) {
          logger.debug(
            `Found version ${packageVersion} for '${repository}' from ${packageJsonPath} (fallback resolution)`
          );
        }
      }
    }

    return { module, packageVersion };
  } catch (error) {
    logger.debug(`Import failed using ${strategy} ('${importPath}'):`, error.message);
    if (error.stack) {
      logger.debug(error.stack);
    }
    return null;
  }
}

/**
 * Collection of import strategies
 */
const importStrategies: ImportStrategy[] = [
  {
    name: 'direct path',
    tryImport: async (repository: string) => tryImporting(repository, 'direct path', repository),
  },
  {
    name: 'local node_modules',
    tryImport: async (repository: string) =>
      tryImporting(resolveNodeModulesPath(repository), 'local node_modules', repository),
  },
  {
    name: 'global node_modules',
    tryImport: async (repository: string) => {
      const globalPath = path.resolve(getGlobalNodeModulesPath(), repository);
      if (!fs.existsSync(path.dirname(globalPath))) {
        logger.debug(
          `Global node_modules directory not found at ${path.dirname(globalPath)}, skipping for ${repository}`
        );
        return null;
      }
      return tryImporting(globalPath, 'global node_modules', repository);
    },
  },
  {
    name: 'package.json entry',
    tryImport: async (repository: string) => {
      // Resolve package.json relative to CWD for this strategy, then use its entry.
      // Version finding will happen inside tryImporting based on resolved entry point.
      const localPackageJsonPath = resolveNodeModulesPath(repository, 'package.json');
      const packageJson = await readPackageJson(localPackageJsonPath);
      if (!packageJson) return null;

      const entryPoint = packageJson.module || packageJson.main || DEFAULT_ENTRY_POINT;
      return tryImporting(
        resolveNodeModulesPath(repository, entryPoint),
        `package.json entry (${entryPoint})`,
        repository
      );
    },
  },
  {
    name: 'common dist pattern',
    tryImport: async (repository: string) => {
      const packageJson = await readPackageJson(repository);
      if (packageJson?.main === DEFAULT_ENTRY_POINT) return null;

      return tryImporting(
        resolveNodeModulesPath(repository, DEFAULT_ENTRY_POINT),
        'common dist pattern',
        repository
      );
    },
  },
];

/**
 * Attempts to load a plugin module using various strategies.
 * It tries direct import, local node_modules, global node_modules,
 * package.json entry points, and common dist patterns.
 *
 * @param repository - The plugin repository/package name to load.
 * @returns The loaded plugin module or null if loading fails after all attempts.
 */
export async function loadPluginModule(
  repository: string
): Promise<{ module: any; packageVersion?: string } | null> {
  logger.debug(`Attempting to load plugin module: ${repository}`);

  for (const strategy of importStrategies) {
    const result = await strategy.tryImport(repository);
    if (result) return result;
  }

  logger.warn(`Failed to load plugin module '${repository}' using all available strategies.`);
  return null;
}
