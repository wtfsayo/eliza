import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Path to store the custom env path setting in the config.json file
const CONFIG_FILE = path.join(os.homedir(), '.eliza', 'config.json');

/**
 * Get the custom env path if one has been set
 * @returns The custom env path or null if not set
 */
export async function getCustomEnvPath(): Promise<string | null> {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }

    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    if (!content) return null;
    const config = JSON.parse(content);
    return config.envPath || null;
  } catch (error: any) {
    console.error(`Error reading custom env path from ${CONFIG_FILE}: ${error.message}`);
    return null;
  }
}

/**
 * Save a custom env path to the config file
 * @param customPath The path to save
 */
export async function saveCustomEnvPath(customPath: string): Promise<void> {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (existsSync(CONFIG_FILE)) {
      try {
        const content = await fs.readFile(CONFIG_FILE, 'utf-8');
        config = JSON.parse(content);
      } catch (e: any) {
        console.warn(`Could not parse existing config file: ${e.message}`);
      }
    }

    config = {
      ...config,
      envPath: customPath,
    };

    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`Custom environment path set to: ${customPath}`);
  } catch (error: any) {
    console.error(`Error saving custom env path: ${error.message}`);
  }
}

/**
 * Get the path to the global .env file in the user's home directory or custom location
 * @returns The path to the global .env file
 */
export async function getGlobalEnvPath(): Promise<string> {
  const customPath = await getCustomEnvPath();
  if (customPath) {
    if (!existsSync(customPath)) {
      console.warn(
        `Custom env path specified in config (${customPath}) does not exist. Falling back to default path.`
      );
      const homeDir = os.homedir();
      const elizaDir = path.join(homeDir, '.eliza');
      if (!existsSync(elizaDir)) {
        try {
          await fs.mkdir(elizaDir, { recursive: true });
          console.warn(`Default config directory ${elizaDir} did not exist. Created it.`);
        } catch (mkdirError: any) {
          console.error(`Failed to create default config directory ${elizaDir}: ${mkdirError.message}`);
        }
      }
      return path.join(elizaDir, '.env');
    }
    return customPath;
  }

  const homeDir = os.homedir();
  const elizaDir = path.join(homeDir, '.eliza');
  if (!existsSync(elizaDir)) {
    try {
      await fs.mkdir(elizaDir, { recursive: true });
      console.warn(`Default config directory ${elizaDir} did not exist. Created it.`);
    } catch (mkdirError: any) {
      console.error(`Failed to create default config directory ${elizaDir}: ${mkdirError.message}`);
    }
  }
  return path.join(elizaDir, '.env');
}

/**
 * Get the path to the local .env file in the current directory
 * @returns The path to the local .env file or null if not found
 */
export function getLocalEnvPath(): string | null {
  const localEnvPath = path.join(process.cwd(), '.env');
  return existsSync(localEnvPath) ? localEnvPath : null;
}

/**
 * Parse an .env file and return the key-value pairs
 * @param filePath Path to the .env file
 * @returns Object containing the key-value pairs
 */
export async function parseEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    if (!existsSync(filePath)) {
      console.warn(`Attempted to parse non-existent env file: ${filePath}`);
      return {};
    }

    const content = await fs.readFile(filePath, 'utf-8');
    if (content.trim() === '') {
      return {};
    }
    return dotenv.parse(content);
  } catch (error: any) {
    console.error(`Error parsing .env file at ${filePath}: ${error.message}`);
    return {};
  }
}

/**
 * Write key-value pairs to an .env file
 * @param filePath Path to the .env file
 * @param envVars Object containing the key-value pairs
 */
export async function writeEnvFile(filePath: string, envVars: Record<string, string>): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    const content = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await fs.writeFile(filePath, content);
    console.log(`Environment variables updated at ${filePath}`);
  } catch (error: any) {
    console.error(`Error writing .env file at ${filePath}: ${error.message}`);
  }
}

/**
 * Mask sensitive values in environment variables
 * @param value The value to mask
 * @returns The masked value
 */
export function maskedValue(value: string): string {
  if (!value) return '';
  if (value.length > 20 && !value.includes(' ')) {
    return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
  }
  return value;
}
