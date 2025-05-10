import { checkServer, displayAgent, handleError } from '@/src/utils';
import type { Agent } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { Command, OptionValues } from 'commander';
import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import prompts from 'prompts';
import { spawn } from 'child_process';
import { create } from '@/src/commands/create';

/**
 * Validates if the given object matches the Character interface structure.
 * @param {unknown} character - The object to validate
 * @returns {boolean} True if the object matches the Character interface structure
 */
function isValidCharacterJson(character: unknown): boolean {
  return (
    typeof character === 'object' &&
    character !== null &&
    typeof (character as any).name === 'string' &&
    Array.isArray((character as any).plugins) &&
    typeof (character as any).system === 'string' &&
    Array.isArray((character as any).bio) &&
    Array.isArray((character as any).messageExamples) &&
    typeof (character as any).style === 'object' &&
    (character as any).style !== null
  );
}

// Helper function to determine the agent runtime URL
export function getAgentRuntimeUrl(opts: OptionValues): string {
  return (
    opts.remoteUrl?.replace(/\/$/, '') || // Use the flag if provided
    process.env.AGENT_RUNTIME_URL?.replace(/\/$/, '') || // Fallback to env var
    `http://localhost:${opts.port || process.env.SERVER_PORT || '3000'}` // Use port flag or env var, default to 3000
  );
}

// Helper function to get the agents base API URL
export function getAgentsBaseUrl(opts: OptionValues): string {
  return `${getAgentRuntimeUrl(opts)}/api/agents`;
}

// Define basic agent interface for type safety
/**
 * Defines the structure of AgentBasic interface.
 * @property {string} id - The unique identifier of the agent.
 * @property {string} name - The name of the agent.
 * @property {string} [status] - The status of the agent (optional).
 * @property {unknown} [key] - Additional properties can be added dynamically using any key.
 */
interface AgentBasic {
  id: string;
  name: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Asynchronously fetches a list of basic agent information from the server.
 * @param {OptionValues} opts - The command options potentially containing the remote URL.
 * @returns {Promise<AgentBasic[]>} A promise that resolves to an array of AgentBasic objects.
 * @throws {Error} If the fetch request fails.
 */
export async function getAgents(opts: OptionValues): Promise<AgentBasic[]> {
  const baseUrl = getAgentsBaseUrl(opts);
  const response = await fetch(baseUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch agents list: ${response.statusText}`);
  }
  return ((await response.json()) as ApiResponse<{ agents: AgentBasic[] }>).data?.agents || [];
}

// Utility function to resolve agent ID from name, index, or direct ID
/**
 * Resolves the ID of an agent based on the provided name, ID, or index.
 *
 * @param {string} idOrNameOrIndex - The name, ID, or index of the agent to resolve.
 * @param {OptionValues} opts - The command options potentially containing the remote URL.
 * @returns {Promise<string>} The resolved ID of the agent.
 * @throws {Error} If the agent is not found.
 */
async function resolveAgentId(idOrNameOrIndex: string, opts: OptionValues): Promise<string> {
  // First try to get all agents to find by name
  const agents = await getAgents(opts);

  // Try to find agent by name
  const agentByName = agents.find(
    (agent) => agent.name.toLowerCase() === idOrNameOrIndex.toLowerCase()
  );

  if (agentByName) {
    return agentByName.id;
  }

  // Try to find agent by ID
  const agentById = agents.find((agent) => agent.id === idOrNameOrIndex);

  if (agentById) {
    return agentById.id;
  }

  // Try to find agent by index
  if (!Number.isNaN(Number(idOrNameOrIndex))) {
    return agents[Number(idOrNameOrIndex)].id;
  }

  // If no agent is found, throw an error
  console.error(`Agent not found: ${idOrNameOrIndex}`);
}

export const agent = new Command().name('agent').description('Manage ElizaOS agents');

/**
 * Interface representing the payload sent when starting an agent.
 * @typedef {Object} AgentStartPayload
 * @property {string} [characterPath] - The path to the character.
 * @property {Record<string, unknown>} [characterJson] - The JSON representation of the character.
 */
interface AgentStartPayload {
  characterPath?: string;
  characterJson?: Record<string, unknown>;
}

/**
 * Interface for defining the structure of an API response.
 * @template T - The type of data included in the response.
 * @property {boolean} success - Flag indicating if the response was successful.
 * @property {T | undefined} data - The data returned in the response.
 * @property {Object | undefined} error - Information about any errors that occurred.
 * @property {string} error.code - The error code.
 * @property {string} error.message - A message describing the error.
 * @property {unknown | undefined} error.details - Additional details about the error.
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

agent
  .command('list')
  .alias('ls')
  .description('List available agents')
  .option('-j, --json', 'output as JSON')
  .action(async (opts) => {
    try {
      // API Endpoint: GET /agents
      const agents = await getAgents(opts);

      // Format data for table
      const agentData = agents.map((agent) => ({
        Name: agent.name,
        ID: agent.id,
        Status: agent.status || 'unknown',
      }));

      if (opts.json) {
        console.info(JSON.stringify(agentData, null, 2));
      } else {
        console.info('\nAvailable agents:');
        if (agentData.length === 0) {
          console.info('No agents found');
        } else {
          console.table(agentData);
        }
      }

      process.exit(0);
    } catch (error) {
      await checkServer(opts);
      handleError(error);
    }
  });

agent
  .command('get')
  .alias('g')
  .description('Get agent details')
  .option('-n, --name <n>', 'agent id, name, or index number from list')
  .option('-j, --json', 'display as JSON')
  .option('-o, --output <file>', 'save to file (default: {name}.json)')
  .action(async (opts) => {
    try {
      const baseUrl = getAgentsBaseUrl(opts);

      // If no name is provided, list all agents
      if (!opts.name) {
        const agents = await getAgents(opts);
        if (opts.json) {
          console.info(JSON.stringify(agents, null, 2));
        } else {
          console.info('\nAvailable agents:');
          if (agents.length === 0) {
            console.info('No agents found');
          } else {
            console.table(
              agents.map((agent) => ({
                Name: agent.name,
                ID: agent.id,
                Status: agent.status || 'unknown',
              }))
            );
          }
        }
        process.exit(0);
      }

      const resolvedAgentId = await resolveAgentId(opts.name, opts);
      console.info(`Getting agent ${resolvedAgentId}`);

      // API Endpoint: GET /agents/:agentId
      const response = await fetch(`${baseUrl}/${resolvedAgentId}`);
      if (!response.ok) {
        const errorData = (await response.json()) as ApiResponse<unknown>;
        logger.error(`Failed to get agent`);
        process.exit(1);
      }

      const { data: agent } = (await response.json()) as ApiResponse<Agent>;

      // Handle output options
      if (opts.output) {
        // Save to specified file
        const jsonPath = opts.output.endsWith('.json') ? opts.output : `${opts.output}.json`;
        const { id, createdAt, updatedAt, enabled, ...agentConfig } = agent;
        fs.writeFileSync(jsonPath, JSON.stringify(agentConfig, null, 2));
        console.log(`Saved agent configuration to ${jsonPath}`);
        process.exit(0);
      }

      // Display the agent
      if (opts.json) {
        // Display as JSON
        const { id, createdAt, updatedAt, enabled, ...agentConfig } = agent;
        console.info(JSON.stringify(agentConfig, null, 2));
      } else {
        // Display formatted
        displayAgent(agent, 'Agent Details');
      }

      process.exit(0);
    } catch (error) {
      await checkServer(opts);
      handleError(error);
    }
  });

/**
 * Checks if an agent with the specified name already exists and is active
 * @param {string} name - The agent name to check
 * @param {OptionValues} opts - Command options containing potential info
 * @returns {Promise<{exists: boolean, isActive: boolean, id?: string}>} - Status object
 */
async function checkAgentStatus(
  name: string,
  opts: OptionValues
): Promise<{ exists: boolean; isActive: boolean; id?: string }> {
  try {
    const agents = await getAgents(opts);
    const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (!agent) {
      return { exists: false, isActive: false };
    }

    return {
      exists: true,
      isActive: agent.status === 'active',
      id: agent.id,
    };
  } catch (error) {
    // If we can't check (e.g., server down), assume it doesn't exist
    return { exists: false, isActive: false };
  }
}

agent
  .command('start')
  .alias('s')
  .description('Start an agent')
  .argument('[agent_name]', 'agent name to start')
  .option('-n, --name <n>', 'agent name to start')
  .option('--path <path>', 'path to character JSON file')
  .action(async (agent_name, options) => {
    try {
      const baseUrl = getAgentsBaseUrl(options);
      const headers = { 'Content-Type': 'application/json' };

      // Use positional argument or the --name option
      const agentName = agent_name || options.name;

      // If name is provided, try to find the corresponding JSON file
      if (agentName) {
        // Check if agent already exists and is active
        const status = await checkAgentStatus(agentName, options);
        if (status.exists && status.isActive) {
          console.error(`Agent '${agentName}' is already active!`);
          process.exit(1);
        }

        const jsonFile = `${agentName}.json`;
        const filePath = path.resolve(process.cwd(), jsonFile);

        if (!fs.existsSync(filePath)) {
          console.error(
            `There is no agent by the name '${agentName}', would you like to create one?`
          );

          // Offer to create the agent
          const { wantToCreate } = await prompts({
            type: 'confirm',
            name: 'wantToCreate',
            message: `Would you like to create a new agent named '${agentName}'?`,
            initial: true,
          });

          if (wantToCreate) {
            // Get the default character template
            const { character: defaultCharacter } = await import('../characters/eliza');

            // Create a new character based on the name
            const newCharacter = {
              ...defaultCharacter,
              name: agentName,
            };

            // Write the character to a JSON file in the current directory
            await writeFile(jsonFile, JSON.stringify(newCharacter, null, 2));
            console.info(`Created new agent: ${jsonFile}`);

            // First create the agent on the server
            const createResponse = await fetch(baseUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ characterJson: newCharacter }),
            });

            const createData = await createResponse.json();
            if (!createData.success) {
              throw new Error('Failed to create agent');
            }
          } else {
            console.info('Operation cancelled.');
            process.exit(0);
          }
        } else {
          // File exists, read it
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const characterJson = JSON.parse(fileContent);
          console.info(`Starting agent from ${jsonFile}`);

          // If agent exists but is not active, reactivate it
          if (status.exists && !status.isActive && status.id) {
            console.info(`Agent '${agentName}' exists but is not active. Reactivating...`);
            const startResponse = await fetch(`${baseUrl}/${status.id}`, {
              method: 'POST',
              headers,
            });

            if (!startResponse.ok) {
              throw new Error(`Failed to start agent runtime: ${startResponse.statusText}`);
            }

            console.info(`Successfully reactivated agent '${agentName}'`);
            process.exit(0);
          }

          // First create the agent
          const createResponse = await fetch(baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ characterJson }),
          });
          const createData = await createResponse.json();
          if (!createData.success) {
            throw new Error('Failed to create agent');
          }
        }

        // Find the agent by name
        const agents = await getAgents(options);
        const agentEntry = agents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
        if (!agentEntry) {
          throw new Error('Agent was created but not found in agent list');
        }
        const agentId = agentEntry.id;

        // Then start the agent's runtime
        const startResponse = await fetch(`${baseUrl}/${agentId}`, {
          method: 'POST',
          headers,
        });
        if (!startResponse.ok) {
          throw new Error(`Failed to start agent runtime: ${startResponse.statusText}`);
        }

        console.info(`Successfully started agent '${agentName}'`);
        process.exit(0);
      }

      // If path is provided, start agent from that file
      if (options.path) {
        const filePath = path.resolve(process.cwd(), options.path);
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found at path: ${filePath}`);
        }
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const characterJson = JSON.parse(fileContent);
        console.info(`Starting agent from ${filePath}`);

        // First create the agent
        const createResponse = await fetch(baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ characterJson }),
        });
        const createData = await createResponse.json();
        if (!createData.success) {
          throw new Error('Failed to create agent');
        }
        // Find the agent by name
        const agents = await getAgents(options);
        const agentEntry = agents.find(
          (a) => a.name.toLowerCase() === characterJson.name.toLowerCase()
        );
        if (!agentEntry) {
          throw new Error('Agent was created but not found in agent list');
        }
        const agentId = agentEntry.id;

        // Then start the agent's runtime
        const startResponse = await fetch(`${baseUrl}/${agentId}`, {
          method: 'POST',
          headers,
        });
        if (!startResponse.ok) {
          throw new Error(`Failed to start agent runtime: ${startResponse.statusText}`);
        }

        console.info(`Successfully started agent from ${filePath}`);
        process.exit(0);
      }

      // If no options provided, scan for character files and prompt for selection
      const characterFiles = fs
        .readdirSync(process.cwd())
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
          try {
            const content = fs.readFileSync(file, 'utf8');
            const character = JSON.parse(content);
            // Validate that the file matches the Character interface structure
            if (isValidCharacterJson(character)) {
              return {
                title: `${character.name} (${file})`,
                value: file,
              };
            }
            return null;
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      // Add "Create new agent" option at the end of the list
      const choices = [
        ...characterFiles,
        {
          title: 'Create new agent',
          value: 'create_new',
        },
      ];

      const { selectedFile } = await prompts({
        type: 'select',
        name: 'selectedFile',
        message: 'Select an agent to start or create a new one:',
        choices,
      });

      if (!selectedFile) {
        process.exit(0);
      }

      if (selectedFile === 'create_new') {
        const { agentName } = await prompts({
          type: 'text',
          name: 'agentName',
          message: 'What would you like to name your agent?',
          validate: (value) => (value.length > 0 ? true : 'Please enter a name'),
        });

        // Create the new agent
        try {
          // Get the default character template
          const { character: defaultCharacter } = await import('../characters/eliza');

          // Create a new character based on the name
          const newCharacter = {
            ...defaultCharacter,
            name: agentName,
          };

          // Write the character to a JSON file in the current directory
          const characterPath = path.join(process.cwd(), `${agentName}.json`);
          await writeFile(characterPath, JSON.stringify(newCharacter, null, 2));
          console.info(`Successfully created agent: ${agentName}`);

          // Read the newly created file
          const fileContent = fs.readFileSync(characterPath, 'utf8');
          const characterJson = JSON.parse(fileContent);
          console.info(`Starting agent from ${characterPath}`);

          // First create the agent
          const createResponse = await fetch(baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ characterJson }),
          });
          const createData = await createResponse.json();
          if (!createData.success) {
            throw new Error('Failed to create agent');
          }
          // Find the agent by name
          const agents = await getAgents(options);
          const agentEntry = agents.find(
            (a) => a.name.toLowerCase() === characterJson.name.toLowerCase()
          );
          if (!agentEntry) {
            throw new Error('Agent was created but not found in agent list');
          }
          const agentId = agentEntry.id;

          // Then start the agent's runtime
          const startResponse = await fetch(`${baseUrl}/${agentId}`, {
            method: 'POST',
            headers,
          });
          if (!startResponse.ok) {
            throw new Error(`Failed to start agent runtime: ${startResponse.statusText}`);
          }

          console.info(`Successfully started agent from ${characterPath}`);
          process.exit(0);
        } catch (error) {
          throw new Error(`Failed to create agent: ${error.message}`);
        }
      }

      const fileContent = fs.readFileSync(selectedFile, 'utf8');
      const characterJson = JSON.parse(fileContent);
      console.info(`Starting agent from ${selectedFile}`);

      // First create the agent
      const createResponse = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ characterJson }),
      });
      const createData = await createResponse.json();
      if (!createData.success) {
        throw new Error('Failed to create agent');
      }
      // Find the agent by name
      const agents = await getAgents(options);
      const agentEntry = agents.find(
        (a) => a.name.toLowerCase() === characterJson.name.toLowerCase()
      );
      if (!agentEntry) {
        throw new Error('Agent was created but not found in agent list');
      }
      const agentId = agentEntry.id;

      // Then start the agent's runtime
      const startResponse = await fetch(`${baseUrl}/${agentId}`, {
        method: 'POST',
        headers,
      });
      if (!startResponse.ok) {
        throw new Error(`Failed to start agent runtime: ${startResponse.statusText}`);
      }

      console.info(`Successfully started agent from ${selectedFile}`);
      process.exit(0);
    } catch (error) {
      await checkServer(options);
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

agent
  .command('stop')
  .alias('st')
  .description('Stop an agent')
  .requiredOption('-n, --name <n>', 'agent id, name, or index number from list')
  .action(async (opts) => {
    try {
      const resolvedAgentId = await resolveAgentId(opts.name, opts);
      const baseUrl = getAgentsBaseUrl(opts);

      console.info(`Stopping agent ${resolvedAgentId}`);

      // API Endpoint: PUT /agents/:agentId (not /agents/:agentId/stop)
      const response = await fetch(`${baseUrl}/${resolvedAgentId}`, { method: 'PUT' });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiResponse<unknown>;
        throw new Error(errorData.error?.message || `Failed to stop agent: ${response.statusText}`);
      }

      logger.success(`Successfully stopped agent ${opts.name}`);
      // Add direct console log for higher visibility
      console.log(`Agent ${opts.name} stopped successfully!`);
    } catch (error) {
      await checkServer(opts);
      handleError(error);
    }
  });

agent
  .command('remove')
  .alias('rm')
  .description('Remove an agent')
  .requiredOption('-n, --name <n>', 'agent id, name, or index number from list')
  .action(async (opts) => {
    try {
      const resolvedAgentId = await resolveAgentId(opts.name, opts);
      const baseUrl = getAgentsBaseUrl(opts);

      console.info(`Removing agent ${resolvedAgentId}`);

      // API Endpoint: DELETE /agents/:agentId
      const response = await fetch(`${baseUrl}/${resolvedAgentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiResponse<unknown>;
        throw new Error(
          errorData.error?.message || `Failed to remove agent: ${response.statusText}`
        );
      }

      // Server returns 204 No Content for successful deletion, no need to parse response
      console.log(`Successfully removed agent ${opts.name}`);
      process.exit(0);
    } catch (error) {
      await checkServer(opts);
      handleError(error);
    }
  });

agent
  .command('set')
  .description('Update agent configuration')
  .requiredOption('-n, --name <n>', 'agent id, name, or index number from list')
  .option('-c, --config <json>', 'agent configuration as JSON string')
  .option('-f, --file <path>', 'path to agent configuration JSON file')
  .action(async (opts) => {
    try {
      const resolvedAgentId = await resolveAgentId(opts.name, opts);

      console.info(`Updating configuration for agent ${resolvedAgentId}`);

      let config: Record<string, unknown>;
      if (opts.config) {
        try {
          config = JSON.parse(opts.config);
        } catch (error) {
          throw new Error(`Failed to parse config JSON string: ${error.message}`);
        }
      } else if (opts.file) {
        try {
          config = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
        } catch (error) {
          throw new Error(`Failed to read or parse config file: ${error.message}`);
        }
      } else {
        throw new Error(
          'Please provide either a config JSON string (-c) or a config file path (-f)'
        );
      }

      // API Endpoint: PATCH /agents/:agentId
      const response = await fetch(`${getAgentsBaseUrl(opts)}/${resolvedAgentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiResponse<unknown>;
        throw new Error(
          errorData.error?.message || `Failed to update agent configuration: ${response.statusText}`
        );
      }

      logger.success(`Successfully updated agent configuration`);
    } catch (error) {
      await checkServer(opts);
      handleError(error);
    }
  });
