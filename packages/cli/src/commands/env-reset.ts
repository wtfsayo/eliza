import { stringToUuid } from '@elizaos/core';
import { rimraf } from 'rimraf';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import prompts from 'prompts';
import colors from 'yoctocolors';
import {
  getGlobalEnvPath,
  parseEnvFile,
  writeEnvFile,
} from './env-utils';

async function resetEnvFile(filePath: string): Promise<boolean> {
  try {
    if (!existsSync(filePath)) {
      return false;
    }

    const envVars = await parseEnvFile(filePath);
    if (Object.keys(envVars).length === 0) {
      return false;
    }

    const resetVars = Object.keys(envVars).reduce(
      (acc, key) => {
        acc[key] = '';
        return acc;
      },
      {} as Record<string, string>
    );

    await writeEnvFile(filePath, resetVars);
    return true;
  } catch (error: any) {
    console.error(`Error resetting environment file at ${filePath}: ${error.message}`);
    return false;
  }
}

type ResetTarget = 'globalEnv' | 'localEnv' | 'cache' | 'globalDb' | 'localDb';
type ResetAction = 'reset' | 'deleted' | 'skipped' | 'warning';

interface ResetItem {
  title: string;
  value: ResetTarget;
  description?: string;
  selected?: boolean;
}

async function safeDeleteDirectory(
  dir: string,
  actions: Record<string, string[]>,
  label: string
): Promise<boolean> {
  if (!existsSync(dir)) {
    actions.skipped.push(`${label} (not found)`);
    return false;
  }

  try {
    await rimraf(dir);
    if (!existsSync(dir)) {
      actions.deleted.push(label);
      return true;
    }
    actions.warnings.push(`Failed to delete ${label.toLowerCase()}`);
    return false;
  } catch (error: any) {
    actions.warnings.push(`Failed to delete ${label.toLowerCase()}: ${error.message}`);
    return false;
  }
}

export async function resetEnv(yes = false): Promise<void> {
  const homeDir = os.homedir();
  const elizaDir = path.join(homeDir, '.eliza');
  const globalEnvPath = await getGlobalEnvPath();
  const cacheDir = path.join(elizaDir, 'cache');
  const projectUuid = stringToUuid(process.cwd());
  const globalDbDir = path.join(elizaDir, 'projects', projectUuid, 'db');
  const globalPgliteDir = path.join(elizaDir, 'projects', projectUuid, 'pglite');
  const localEnvPath = path.join(process.cwd(), '.env');
  const localDbDir = path.join(process.cwd(), 'elizadb');

  let usingExternalPostgres = false;
  try {
    const globalEnvVars = await parseEnvFile(globalEnvPath);
    const localEnvVars = await parseEnvFile(localEnvPath);
    usingExternalPostgres =
      (globalEnvVars.POSTGRES_URL && globalEnvVars.POSTGRES_URL.trim() !== '') ||
      (localEnvVars.POSTGRES_URL && localEnvVars.POSTGRES_URL.trim() !== '');
  } catch {
    // ignore
  }

  const resetItems: ResetItem[] = [
    { title: 'Global environment variables', value: 'globalEnv', description: 'Reset values in global .env file', selected: false },
    { title: 'Local environment variables', value: 'localEnv', description: 'Reset values in local .env file', selected: false },
    {
      title: 'Cache folder',
      value: 'cache',
      description: existsSync(cacheDir) ? 'Delete the cache folder' : 'Cache folder not found, nothing to delete',
      selected: false,
    },
    {
      title: 'Global database files',
      value: 'globalDb',
      description:
        !existsSync(globalDbDir) && !existsSync(globalPgliteDir)
          ? 'Global database files not found, nothing to delete'
          : usingExternalPostgres
            ? 'WARNING: External PostgreSQL database detected - only local files will be removed'
            : 'Delete global database files',
      selected: false,
    },
    {
      title: 'Local database files',
      value: 'localDb',
      description: existsSync(localDbDir) ? 'Delete local database files' : 'Local database folder not found, nothing to delete',
      selected: false,
    },
  ];

  let selectedValues: ResetTarget[] = [];

  if (yes) {
    selectedValues = resetItems.map((item) => item.value);
  } else {
    const { selections } = await prompts({
      type: 'multiselect',
      name: 'selections',
      message: colors.cyan(colors.bold('Select items to reset:')),
      choices: resetItems,
      instructions: false,
      hint: '- Space to select, Enter to confirm',
      min: 1,
    });

    if (!selections || selections.length === 0) {
      console.log('No items selected. Reset cancelled.');
      return;
    }

    selectedValues = selections;

    console.log('\nYou selected:');
    for (const value of selectedValues) {
      const item = resetItems.find((i) => i.value === value);
      if (item) console.log(`  • ${item.title}`);
    }

    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to reset the selected items?',
      initial: false,
    });

    if (!confirm) {
      console.log('Reset cancelled.');
      return;
    }
  }

  const actions: Record<ResetAction, string[]> = {
    reset: [],
    deleted: [],
    skipped: [],
    warning: [],
  };

  for (const target of selectedValues) {
    switch (target) {
      case 'globalEnv':
        if (await resetEnvFile(globalEnvPath)) {
          actions.reset.push('Global environment variables');
        } else {
          actions.skipped.push('Global environment variables (no file or empty)');
        }
        break;
      case 'localEnv':
        if (await resetEnvFile(localEnvPath)) {
          actions.reset.push('Local environment variables');
        } else {
          actions.skipped.push('Local environment variables (no file or empty)');
        }
        break;
      case 'cache':
        await safeDeleteDirectory(cacheDir, actions, 'Cache folder');
        break;
      case 'globalDb': {
        if (usingExternalPostgres) {
          actions.warning.push(
            'External PostgreSQL database detected. Database data cannot be reset but local database cache files will be removed.'
          );
        }
        let anyGlobalDbDeleted = false;
        if (existsSync(globalDbDir)) {
          if (await safeDeleteDirectory(globalDbDir, actions, 'Global database folder')) {
            anyGlobalDbDeleted = true;
          }
        }
        if (existsSync(globalPgliteDir)) {
          if (await safeDeleteDirectory(globalPgliteDir, actions, 'Global PGLite database folder')) {
            anyGlobalDbDeleted = true;
          }
        }
        if (!anyGlobalDbDeleted && !existsSync(globalDbDir) && !existsSync(globalPgliteDir)) {
          actions.skipped.push('Global database files (not found)');
        }
        break;
      }
      case 'localDb':
        await safeDeleteDirectory(localDbDir, actions, 'Local database folder');
        break;
    }
  }

  console.log(colors.bold('\nReset Summary:'));

  if (actions.reset.length > 0) {
    console.log(colors.green('  Values Cleared:'));
    actions.reset.forEach((item) => console.log(`    • ${item}`));
  }
  if (actions.deleted.length > 0) {
    console.log(colors.green('  Deleted:'));
    actions.deleted.forEach((item) => console.log(`    • ${item}`));
  }
  if (actions.skipped.length > 0) {
    console.log(colors.yellow('  Skipped:'));
    actions.skipped.forEach((item) => console.log(`    • ${item}`));
  }
  if (actions.warning.length > 0) {
    console.log(colors.red('  Warnings:'));
    actions.warning.forEach((item) => console.log(`    • ${item}`));
  }

  console.log(colors.bold('\nEnvironment reset complete'));
}
