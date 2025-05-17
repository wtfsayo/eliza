import { UserEnvironment } from '@/src/utils';
import path from 'node:path';
import { existsSync } from 'node:fs';
import colors from 'yoctocolors';
import {
  getGlobalEnvPath,
  getLocalEnvPath,
  parseEnvFile,
  maskedValue,
} from './env-utils';

/**
 * Displays system information and lists environment variables from global and local `.env` files.
 */
export async function listEnvVars(): Promise<void> {
  const envInfo = await UserEnvironment.getInstanceInfo();
  const globalEnvPath = await getGlobalEnvPath();
  const localEnvPath = getLocalEnvPath();

  console.info(colors.bold('\nSystem Information:'));
  console.info(`  Platform: ${colors.cyan(envInfo.os.platform)} (${envInfo.os.release})`);
  console.info(`  Architecture: ${colors.cyan(envInfo.os.arch)}`);
  console.info(`  CLI Version: ${colors.cyan(envInfo.cli.version)}`);
  console.info(
    `  Package Manager: ${colors.cyan(envInfo.packageManager.name)}${envInfo.packageManager.version ? ` v${envInfo.packageManager.version}` : ''}`
  );

  console.info(colors.bold('\nGlobal Environment Variables:'));
  console.info(`Path: ${globalEnvPath}`);

  if (!existsSync(globalEnvPath)) {
    console.info('  No global environment variables set');
  } else {
    const globalEnvVars = await parseEnvFile(globalEnvPath);
    for (const [key, value] of Object.entries(globalEnvVars)) {
      console.info(`  ${colors.green(key)}: ${maskedValue(value)}`);
    }
  }

  console.info(colors.bold('\nLocal Environment Variables:'));
  const localEnvFilePath = path.join(process.cwd(), '.env');
  console.info(`Path: ${localEnvFilePath}`);

  if (!existsSync(localEnvFilePath)) {
    console.info(colors.yellow('  No local .env file found'));
    const exampleEnvPath = path.join(process.cwd(), '.env.example');
    if (existsSync(exampleEnvPath)) {
      console.info(colors.red('  ✖ Missing .env file. Create one with:'));
      console.info(`     ${colors.bold(colors.green('cp .env.example .env'))}`);
    } else {
      console.info(
        colors.red('  ✖ Missing .env file. Create one in your project directory to set local environment variables.')
      );
    }
  } else {
    const localEnvVars = await parseEnvFile(localEnvFilePath);
    if (Object.keys(localEnvVars).length === 0) {
      console.info('  No local environment variables set');
    } else {
      for (const [key, value] of Object.entries(localEnvVars)) {
        console.info(`  ${colors.green(key)}: ${maskedValue(value)}`);
      }
    }
  }

  console.info('\n');
  console.info(
    colors.cyan('You can also edit environment variables in the web UI: http://localhost:3000/settings')
  );
}
