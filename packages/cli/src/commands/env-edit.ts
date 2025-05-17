import fs from 'node:fs/promises';
import prompts from 'prompts';
import colors from 'yoctocolors';
import {
  getGlobalEnvPath,
  getLocalEnvPath,
  parseEnvFile,
  writeEnvFile,
  maskedValue,
} from './env-utils';

/**
 * Edit environment variables.
 * @param scope Whether to edit global or local environment variables
 * @param fromMainMenu Indicates if invoked from the interactive menu
 * @param yes Skip confirmation prompts
 */
export async function editEnvVars(
  scope: 'global' | 'local',
  fromMainMenu = false,
  yes = false
): Promise<boolean> {
  const envPath = scope === 'global' ? await getGlobalEnvPath() : getLocalEnvPath();

  if (scope === 'local' && !envPath) {
    let createLocal = true;
    if (!yes) {
      const resp = await prompts({
        type: 'confirm',
        name: 'createLocal',
        message: 'No local .env file found. Create one?',
        initial: true,
      });
      createLocal = resp.createLocal;
    }
    if (!createLocal) {
      return false;
    }
    await fs.writeFile('.env', '');
  }

  const envVars = await parseEnvFile(envPath);

  console.info(colors.bold(`\nCurrent ${scope} environment variables:`));
  if (Object.keys(envVars).length === 0) {
    console.info(`  No ${scope} environment variables set`);

    const { addNew } = await prompts({
      type: 'confirm',
      name: 'addNew',
      message: 'Would you like to add a new environment variable?',
      initial: true,
    });

    if (addNew) {
      await addNewVariable(envPath, envVars);
    }

    return fromMainMenu;
  }

  let exit = false;
  let returnToMain = false;

  while (!exit) {
    const entries = Object.entries(envVars);
    const choices = [
      ...entries.map(([key, value]) => ({ title: `${key}: ${maskedValue(value)}`, value: key })),
      { title: 'Add new variable', value: 'add_new' },
      fromMainMenu ? { title: 'Back to main menu', value: 'back_to_main' } : { title: 'Exit', value: 'exit' },
    ];

    const { selection } = await prompts({
      type: 'select',
      name: 'selection',
      message: 'Select a variable to edit or an action:',
      choices,
    });

    if (!selection) {
      return fromMainMenu;
    }

    if (selection === 'exit' || selection === 'back_to_main') {
      exit = true;
      returnToMain = selection === 'back_to_main';
      continue;
    }

    if (selection === 'add_new') {
      await addNewVariable(envPath, envVars);
      continue;
    }

    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: `What would you like to do with ${selection}?`,
      choices: [
        { title: 'Edit', value: 'edit' },
        { title: 'Delete', value: 'delete' },
        { title: 'Back', value: 'back' },
      ],
    });

    if (!action || action === 'back') {
      continue;
    }

    if (action === 'edit') {
      const { value } = await prompts({
        type: 'text',
        name: 'value',
        message: `Enter the new value for ${selection}:`,
        initial: envVars[selection],
      });

      if (value !== undefined) {
        envVars[selection] = value;
        await writeEnvFile(envPath, envVars);
        console.log(`Updated ${scope} environment variable: ${selection}`);
      }
    } else if (action === 'delete') {
      let confirm = true;
      if (!yes) {
        const resp = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete ${selection}?`,
          initial: false,
        });
        confirm = resp.confirm;
      }
      if (confirm) {
        delete envVars[selection];
        await writeEnvFile(envPath, envVars);
        console.log(`Removed ${scope} environment variable: ${selection}`);
      }
    }
  }

  return returnToMain && fromMainMenu;
}

async function addNewVariable(envPath: string, envVars: Record<string, string>): Promise<void> {
  const { key } = await prompts({
    type: 'text',
    name: 'key',
    message: 'Enter the variable name:',
    validate: (value) => (value.trim() !== '' ? true : 'Variable name cannot be empty'),
  });

  if (!key) return;

  const { value } = await prompts({
    type: 'text',
    name: 'value',
    message: `Enter the value for ${key}:`,
  });

  if (value !== undefined) {
    envVars[key] = value;
    await writeEnvFile(envPath, envVars);
    console.log(`Added environment variable: ${key}`);
  }
}
