import { loadProject, type Project } from '@/src/project';
import { AgentServer } from '@/src/server/index';
import { jsonToCharacter, loadCharacterTryPath } from '@/src/server/loader';
import { TestRunner, buildProject, promptForEnvVars } from '@/src/utils';
import { type IAgentRuntime, type ProjectAgent } from '@elizaos/core';
import { Command, Option } from 'commander';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import { existsSync } from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import path from 'node:path';
import { startAgent } from './start';

// Helper function to check port availability
async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Check if the current directory is likely a plugin directory
 */
function checkIfLikelyPluginDir(dir: string): boolean {
  // Simple check based on common file patterns
  return (
    dir.includes('plugin') ||
    existsSync(path.join(dir, 'src/plugins.ts')) ||
    (existsSync(path.join(dir, 'src/index.ts')) && !existsSync(path.join(dir, 'src/agent.ts')))
  );
}

async function setupServer(): Promise<AgentServer> {
  const homeDir = os.homedir();
  const elizaDir = path.join(homeDir, '.eliza');
  const elizaDbDir = path.join(elizaDir, 'db');
  const envFilePath = path.join(elizaDir, '.env');

  if (!fs.existsSync(elizaDir)) {
    fs.mkdirSync(elizaDir, { recursive: true });
  }
  if (!fs.existsSync(elizaDbDir)) {
    fs.mkdirSync(elizaDbDir, { recursive: true });
  }

  process.env.PGLITE_DATA_DIR = elizaDbDir;
  if (fs.existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath });
  }

  await promptForEnvVars('pglite');

  const server = new AgentServer({
    dataDir: elizaDbDir,
    postgresUrl: process.env.POSTGRES_URL,
  });

  await server.initialize();

  await new Promise<void>((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 5;
    const checkInterval = setInterval(async () => {
      try {
        if (await server.database?.getConnection()) {
          clearInterval(checkInterval);
          resolve();
          return;
        }
        attempts++;
        try {
          await server.database?.init();
          clearInterval(checkInterval);
          resolve();
        } catch (err) {
          if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            reject(err);
          }
        }
      } catch (err) {
        clearInterval(checkInterval);
        reject(err);
      }
    }, 1000);

    setTimeout(async () => {
      clearInterval(checkInterval);
      if (await server.database?.getConnection()) {
        resolve();
      } else {
        reject(new Error('Database initialization timed out after 30 seconds'));
      }
    }, 30000);
  });

  server.startAgent = async (character) => startAgent(character, server);
  server.loadCharacterTryPath = loadCharacterTryPath;
  server.jsonToCharacter = jsonToCharacter;

  return server;
}

async function loadProjectConfig(): Promise<Project> {
  const project = await loadProject(process.cwd());
  if (!project || !project.agents || project.agents.length === 0) {
    throw new Error('No agents found in project configuration');
  }
  return project;
}

async function startProjectAgents(project: Project, server: AgentServer) {
  const runtimes: IAgentRuntime[] = [];
  const projectAgents: ProjectAgent[] = [];

  if (project.isPlugin || project.agents.length === 0) {
    process.env.ELIZA_TESTING_PLUGIN = 'true';
    const { character: defaultElizaCharacter } = await import('../characters/eliza');
    const pluginsToTest = [project.pluginModule];
    const runtime = await startAgent(defaultElizaCharacter, server, undefined, pluginsToTest, {
      isPluginTestMode: true,
    });
    runtimes.push(runtime);
    projectAgents.push({ character: defaultElizaCharacter, plugins: pluginsToTest });
  } else {
    for (const agent of project.agents) {
      try {
        const characterCopy = { ...agent.character };
        const runtime = await startAgent(characterCopy, server, agent.init, agent.plugins || []);
        runtimes.push(runtime);
        projectAgents.push(agent);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`Error starting agent ${agent.character.name}:`, err);
      }
    }
  }

  if (runtimes.length === 0) {
    throw new Error('Failed to start any agents from project');
  }

  return { runtimes, projectAgents };
}

async function runTestsForAgents(
  project: Project,
  runtimes: IAgentRuntime[],
  projectAgents: ProjectAgent[],
  options: { plugin?: string; skipPlugins?: boolean; skipProjectTests?: boolean }
) {
  let totalFailed = 0;
  for (let i = 0; i < runtimes.length; i++) {
    const runtime = runtimes[i];
    const projectAgent = projectAgents[i];
    const testRunner = new TestRunner(runtime, projectAgent);
    const skipPlugins = project.isPlugin ? true : options.skipPlugins;
    const results = await testRunner.runTests({
      filter: options.plugin,
      skipPlugins,
      skipProjectTests: options.skipProjectTests,
    });
    totalFailed += results.failed;
  }
  return totalFailed;
}

/**
 * Function that runs the tests.
 */
async function runAgentTests(options: {
  port?: number;
  plugin?: string;
  skipPlugins?: boolean;
  skipProjectTests?: boolean;
  skipBuild?: boolean;
}) {
  if (options && !options.skipBuild) {
    try {
      const cwd = process.cwd();
      const isPlugin = options.plugin ? true : checkIfLikelyPluginDir(cwd);
      console.info(`Building ${isPlugin ? 'plugin' : 'project'}...`);
      await buildProject(cwd, isPlugin);
      console.info('Build completed successfully');
    } catch (buildError) {
      console.error(`Build error: ${buildError}`);
      console.warn('Attempting to continue with tests despite build error');
    }
  }

  try {
    const server = await setupServer();
    const project = await loadProjectConfig();
    const serverPort = options.port || Number.parseInt(process.env.SERVER_PORT || '3000');
    await server.start(serverPort);
    const { runtimes, projectAgents } = await startProjectAgents(project, server);
    const totalFailed = await runTestsForAgents(project, runtimes, projectAgents, options);
    await server.stop();
    process.exit(totalFailed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error in runAgentTests:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    } else {
      console.error('Unknown error type:', typeof error);
      console.error('Error value:', error);
      try {
        console.error('Stringified error:', JSON.stringify(error, null, 2));
      } catch (e) {
        console.error('Could not stringify error:', e);
      }
    }
    throw error;
  }
}

// Create command that can be imported directly
export const test = new Command()
  .name('test')
  .description('Run tests for Eliza agent plugins')
  .addOption(
    new Option('-p, --port <port>', 'Port to listen on').argParser((val) => Number.parseInt(val))
  )
  .option('-pl, --plugin <name>', 'Name of plugin to test')
  .option('-sp, --skip-plugins', 'Skip plugin tests')
  .option('-spt, --skip-project-tests', 'Skip project tests')
  .option('-sb, --skip-build', 'Skip building before running tests')
  .action(async (options) => {
    console.info('Starting test command...');
    console.info('Command options:', options);
    try {
      console.info('Running agent tests...');
      await runAgentTests(options);
    } catch (error) {
      console.error('Error running tests:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      } else {
        console.error('Unknown error type:', typeof error);
        console.error('Error value:', error);
        try {
          console.error('Stringified error:', JSON.stringify(error, null, 2));
        } catch (e) {
          console.error('Could not stringify error:', e);
        }
      }
      process.exit(1);
    }
  });

// This is the function that registers the command with the CLI
export default function registerCommand(cli: Command) {
  return cli.addCommand(test);
}
