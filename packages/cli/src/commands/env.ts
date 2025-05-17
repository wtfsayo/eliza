import { handleError, UserEnvironment } from '@/src/utils';
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import prompts from 'prompts';
import colors from 'yoctocolors';

import {
  getCustomEnvPath,
  getGlobalEnvPath,
  getLocalEnvPath,
  parseEnvFile,
  saveCustomEnvPath,
  writeEnvFile,
  maskedValue,
} from './env-utils';
import { listEnvVars } from './env-list';
import { editEnvVars } from './env-edit';
import { resetEnv } from './env-reset';

export { getGlobalEnvPath, parseEnvFile } from './env-utils';

async function setEnvPath(customPath: string, autoConfirm = false): Promise<void> {
  if (customPath.startsWith('~')) {
    customPath = os.homedir() + customPath.substring(1);
  }

  const resolvedPath = path.resolve(customPath);
  const isDirectory = existsSync(resolvedPath) && (await fs.stat(resolvedPath)).isDirectory();

  let finalPath = resolvedPath;
  if (isDirectory) {
    finalPath = path.join(resolvedPath, '.env');
    console.info(`Path is a directory. Will use ${finalPath} for environment variables.`);
  }

  const parentDir = path.dirname(finalPath);
  if (!existsSync(parentDir)) {
    let createDir = autoConfirm;
    if (!autoConfirm) {
      const response = await prompts({
        type: 'confirm',
        name: 'createDir',
        message: `Directory ${parentDir} does not exist. Create it?`,
        initial: true,
      });
      createDir = response.createDir;
    }

    if (createDir) {
      try {
        await fs.mkdir(parentDir, { recursive: true });
        console.log(`Created directory: ${parentDir}`);
      } catch (error: any) {
        console.error(`Failed to create directory: ${error.message}`);
        console.info('Custom path not set');
        return;
      }
    } else {
      console.info('Custom path not set');
      return;
    }
  }

  if (!existsSync(finalPath)) {
    let createFile = autoConfirm;
    if (!autoConfirm) {
      const response = await prompts({
        type: 'confirm',
        name: 'createFile',
        message: `Environment file doesn't exist at ${finalPath}. Create an empty one?`,
        initial: true,
      });
      createFile = response.createFile;
    }

    if (createFile) {
      await writeEnvFile(finalPath, {});
      console.log(`Created empty .env file at ${finalPath}`);
    } else if (!autoConfirm) {
      console.info('Custom path not set as file creation was declined.');
      return;
    }
  }

  await saveCustomEnvPath(finalPath);
}

export const env = new Command()
  .name('env')
  .description('Manage environment variables and secrets');

env
  .command('list')
  .description('List all environment variables')
  .option('--system', 'List only system information')
  .option('--global', 'List only global environment variables')
  .option('--local', 'List only local environment variables')
  .action(async (options: { global?: boolean; local?: boolean; system?: boolean }) => {
    try {
      if (options.system) {
        const envInfo = await UserEnvironment.getInstanceInfo();
        console.info(colors.bold('\nSystem Information:'));
        console.info(`  Platform: ${colors.cyan(envInfo.os.platform)} (${envInfo.os.release})`);
        console.info(`  Architecture: ${colors.cyan(envInfo.os.arch)}`);
        console.info(`  CLI Version: ${colors.cyan(envInfo.cli.version)}`);
        console.info(
          `  Package Manager: ${colors.cyan(envInfo.packageManager.name)}${envInfo.packageManager.version ? ` v${envInfo.packageManager.version}` : ''}`
        );
      } else if (options.local) {
        const localEnvPath = getLocalEnvPath();
        if (!localEnvPath) {
          console.error('No local .env file found in the current directory');
          process.exit(1);
        }
        const localEnvVars = await parseEnvFile(localEnvPath);
        console.info(colors.bold('\nLocal environment variables (.env):'));
        if (Object.keys(localEnvVars).length === 0) {
          console.info('  No local environment variables set');
        } else {
          for (const [key, value] of Object.entries(localEnvVars)) {
            console.info(`  ${colors.green(key)}: ${maskedValue(value)}`);
          }
        }
      } else if (options.global) {
        const globalEnvPath = await getGlobalEnvPath();
        const globalEnvVars = await parseEnvFile(globalEnvPath);
        const customPath = await getCustomEnvPath();
        const globalEnvLabel = customPath
          ? `Global environment variables (custom path: ${customPath})`
          : 'Global environment variables (.eliza/.env)';

        console.info(colors.bold(`\n${globalEnvLabel}:`));
        if (Object.keys(globalEnvVars).length === 0) {
          console.info('  No global environment variables set');
        } else {
          for (const [key, value] of Object.entries(globalEnvVars)) {
            console.info(`  ${colors.green(key)}: ${maskedValue(value)}`);
          }
        }
      } else {
        await listEnvVars();
      }
    } catch (error) {
      handleError(error);
    }
  });

env
  .command('edit-global')
  .description('Edit global environment variables')
  .option('-y, --yes', 'Automatically confirm prompts')
  .action(async (options) => {
    try {
      await editEnvVars('global', false, options.yes);
    } catch (error) {
      handleError(error);
    }
  });

env
  .command('edit-local')
  .description('Edit local environment variables')
  .option('-y, --yes', 'Automatically confirm prompts')
  .action(async (options) => {
    try {
      await editEnvVars('local', false, options.yes);
    } catch (error) {
      handleError(error);
    }
  });

env
  .command('reset')
  .description('Reset environment variables and clean up database/cache files (interactive selection)')
  .option('-y, --yes', 'Automatically reset using default selections')
  .action(async (options: { yes?: boolean }) => {
    try {
      await resetEnv(options.yes);
    } catch (error) {
      handleError(error);
    }
  });

env
  .command('set-path <path>')
  .description('Set a custom path for the global environment file')
  .option('-y, --yes', 'Automatically create directory and file if they do not exist')
  .action(async (customPath: string, options: { yes?: boolean }) => {
    try {
      await setEnvPath(customPath, options.yes);
    } catch (error) {
      handleError(error);
    }
  });

env
  .command('interactive')
  .description('Interactive environment variable management')
  .option('-y, --yes', 'Automatically confirm prompts')
  .action(async (options) => {
    try {
      await showMainMenu(options.yes);
    } catch (error) {
      handleError(error);
    }
  });

env.action(() => {
  console.log(colors.bold('\nEliza Environment Variable Manager'));
  console.log('\nAvailable commands:');
  console.log('  list                  List all environment variables');
  console.log('  edit-global           Edit global environment variables');
  console.log('  edit-local            Edit local environment variables');
  console.log('  set-path <path>       Set a custom path for the global environment file');
  console.log('  reset                 Reset environment variables and clean up database/cache files (interactive selection)');
  console.log('  interactive           Start interactive environment variable manager');
  console.log('\nYou can also edit environment variables in the web UI:');
  console.log('  http://localhost:3000/settings');
});

async function showMainMenu(yes = false): Promise<void> {
  let exit = false;

  while (!exit) {
    let action: string | undefined;
    if (yes) {
      action = 'list';
    } else {
      const resp = await prompts({
        type: 'select',
        name: 'action',
        message: 'Select an action:',
        choices: [
          { title: 'List environment variables', value: 'list' },
          { title: 'Edit global environment variables', value: 'edit_global' },
          { title: 'Edit local environment variables', value: 'edit_local' },
          { title: 'Set custom environment path', value: 'set_path' },
          { title: 'Reset environment variables', value: 'reset' },
          { title: 'Exit', value: 'exit' },
        ],
      });
      action = resp.action;
    }
    if (!action || action === 'exit') {
      exit = true;
      continue;
    }
    switch (action) {
      case 'list':
        await listEnvVars();
        break;
      case 'edit_global': {
        const returnToMainFromGlobal = await editEnvVars('global', true);
        exit = !returnToMainFromGlobal;
        break;
      }
      case 'edit_local': {
        const returnToMainFromLocal = await editEnvVars('local', true);
        exit = !returnToMainFromLocal;
        break;
      }
      case 'set_path': {
        const { path: customPath } = await prompts({
          type: 'text',
          name: 'path',
          message: 'Enter custom path for global environment file:',
        });
        if (customPath) {
          await setEnvPath(customPath, yes);
        }
        break;
      }
      case 'reset':
        await resetEnv();
        break;
    }
  }
}
