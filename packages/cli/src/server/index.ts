import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Character,
  DatabaseAdapter,
  type IAgentRuntime,
  type UUID,
  logger,
} from '@elizaos/core';
import { createDatabaseAdapter } from '@elizaos/plugin-sql';
import * as bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createApiRouter, setupSocketIO, createPluginRouteHandler } from './api';
import http from 'node:http';
import { apiKeyAuthMiddleware } from './authMiddleware';
import { PGlite } from '@electric-sql/pglite';
import { Pool as PgPool } from 'pg';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Represents a function that acts as a server middleware.
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object.
 * @param {express.NextFunction} next - The next function to be called in the middleware chain.
 * @returns {void}
 */
export type ServerMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => void;

/**
 * Interface for defining server configuration options.
 * @typedef {Object} ServerOptions
 * @property {ServerMiddleware[]} [middlewares] - Optional array of server middlewares.
 * @property {string} [dataDir] - Optional directory for storing server data.
 * @property {string} [postgresUrl] - Optional URL for connecting to a PostgreSQL database.
 */
export interface ServerOptions {
  middlewares?: ServerMiddleware[];
  dataDir?: string;
  postgresUrl?: string;
}
const AGENT_RUNTIME_URL =
  process.env.AGENT_RUNTIME_URL?.replace(/\/$/, '') || 'http://localhost:3000';

/**
 * Class representing an agent server.
 */ /**
 * Represents an agent server which handles agents, database, and server functionalities.
 */
export class AgentServer {
  public app: express.Application;
  private agents: Map<UUID, IAgentRuntime>;
  public server: http.Server;
  public socketIO: SocketIOServer;
  private serverPort: number = 3000; // Add property to store current port

  public database: DatabaseAdapter;
  public startAgent!: (character: Character) => Promise<IAgentRuntime>;
  public stopAgent!: (runtime: IAgentRuntime) => void;
  public loadCharacterTryPath!: (characterPath: string) => Promise<Character>;
  public jsonToCharacter!: (character: unknown) => Promise<Character>;

  /**
   * Constructor for AgentServer class.
   *
   * @param {ServerOptions} [options] - The options for the server.
   * @constructor
   */
  constructor(options?: ServerOptions) {
    try {
      logger.debug('Initializing AgentServer...');
      this.agents = new Map();

      let dataDir = options?.dataDir ?? process.env.PGLITE_DATA_DIR ?? './elizadb';

      // Expand tilde in database directory path
      dataDir = expandTildePath(dataDir);

      // Use the async database adapter
      this.database = createDatabaseAdapter(
        {
          dataDir,
          postgresUrl: options?.postgresUrl,
        },
        '00000000-0000-0000-0000-000000000002'
      );

      // Database initialization moved to initialize() method
    } catch (error) {
      logger.error('Failed to initialize AgentServer:', error);
      throw error;
    }
  }

  /**
   * Initializes the database and server.
   *
   * @param {ServerOptions} [options] - Optional server options.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  public async initialize(options?: ServerOptions): Promise<void> {
    try {
      // Special check for running in CI/test environment - try to create vector extension first
      // Check if we're likely in a test environment by examining environment variables
      const isTestEnv =
        process.env.TEST_SERVER_PORT ||
        process.env.CI ||
        process.env.NODE_ENV === 'test' ||
        process.env.JEST_WORKER_ID;

      if (isTestEnv) {
        logger.debug('Detected test environment, attempting to initialize vector extension first');
        try {
          // Get database connection early
          const connection = await this.database.getConnection();

          // Create vector extension first before any other initialization
          try {
            if (connection instanceof PGlite) {
              logger.debug('Creating vector extension using PGLite connection (test environment)');
              await connection.query('CREATE EXTENSION IF NOT EXISTS vector;');
              logger.info('Successfully created vector extension for tests');
            } else if (connection instanceof PgPool) {
              logger.debug('Creating vector extension using PgPool connection (test environment)');
              await connection.query('CREATE EXTENSION IF NOT EXISTS vector;');
              logger.info('Successfully created vector extension for tests');
            }
          } catch (extErr) {
            logger.warn('Failed to create vector extension in test environment:', extErr.message);
          }
        } catch (connErr) {
          logger.warn(
            'Failed to get connection to create vector extension in test environment:',
            connErr.message
          );
        }
      }

      // Initialize the database with await
      try {
        await this.database.init();
        logger.success('Database initialized successfully');
      } catch (error) {
        // Special handling for vector type error
        if (error.message && error.message.includes('type "vector" does not exist')) {
          logger.warn('Vector extension not found in database, attempting to create it');

          try {
            // Try to create the vector extension first using getConnection
            const connection = await this.database.getConnection();

            // First try to create the extension - handle both PGlite and PgPool connections
            try {
              // Use type guards to handle different connection types
              if (connection instanceof PGlite) {
                logger.debug('Using PGlite connection to create vector extension');
                await connection.query('CREATE EXTENSION IF NOT EXISTS vector;');
                logger.info('Successfully created vector extension (PGlite)');
              } else if (connection instanceof PgPool) {
                logger.debug('Using PgPool connection to create vector extension');
                // In CI environments, we might need to retry this operation
                let attempts = 0;
                const maxAttempts = 3;
                let success = false;

                while (!success && attempts < maxAttempts) {
                  attempts++;
                  try {
                    await connection.query('CREATE EXTENSION IF NOT EXISTS vector;');
                    logger.info(
                      `Successfully created vector extension (PgPool) on attempt ${attempts}`
                    );
                    success = true;
                  } catch (extCreateError) {
                    logger.warn(
                      `Failed to create vector extension (attempt ${attempts}/${maxAttempts}): ${extCreateError.message}`
                    );
                    if (attempts < maxAttempts) {
                      logger.debug(`Waiting before retry...`);
                      await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                  }
                }

                if (!success) {
                  logger.warn('Failed to create vector extension after multiple attempts');
                }
              } else {
                logger.warn('Unknown connection type, cannot create vector extension');
              }
            } catch (extError) {
              logger.warn(
                'Could not create vector extension, will proceed without it:',
                extError.message
              );
            }

            // Then try database initialization again
            try {
              await this.database.init();
              logger.success('Database initialized successfully after adding vector extension');
            } catch (retryError) {
              // Try a more direct approach if database initialization still fails
              if (
                retryError.message &&
                retryError.message.includes('type "vector" does not exist')
              ) {
                logger.warn('Still failing with vector error, trying one more approach...');
                try {
                  // Check if we have direct access to run SQL on the pglite instance
                  // Check if database has query method using type guard
                  const dbWithQuery = this.database as any;
                  if (dbWithQuery && typeof dbWithQuery.query === 'function') {
                    await dbWithQuery.query('CREATE EXTENSION IF NOT EXISTS vector;');
                    logger.info('Created vector extension using direct database.query');

                    // Try init again
                    await this.database.init();
                    logger.success(
                      'Database initialized successfully after direct vector extension creation'
                    );
                  } else {
                    logger.warn('No direct query method available on database adapter');
                  }
                } catch (finalError) {
                  logger.error(
                    'Final attempt to create vector extension failed:',
                    finalError.message
                  );
                  logger.warn('Continuing with limited database functionality');
                }
              } else {
                logger.error(
                  'Failed to initialize database after vector extension attempt:',
                  retryError.message
                );
                // Continue anyway to allow basic functionality without vector support
                logger.warn('Continuing with limited database functionality');
              }
            }
          } catch (retryError) {
            logger.error(
              'Failed to initialize database after vector extension attempt:',
              retryError
            );
            // Continue anyway to allow basic functionality without vector support
            logger.warn('Continuing with limited database functionality');
          }
        } else {
          // For other errors, just log and continue
          logger.error('Database initialization error:', error);
          logger.warn('Continuing with limited database functionality');
        }
      }

      // Only continue with server initialization after database is ready
      await this.initializeServer(options);

      // wait 250 ms
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Success message moved to start method
    } catch (error) {
      logger.error('Failed to initialize:', error);
      console.trace(error);
      throw error;
    }
  }

  /**
   * Initializes the server with the provided options.
   *
   * @param {ServerOptions} [options] - Optional server options.
   * @returns {Promise<void>} - A promise that resolves once the server is initialized.
   */
  private async initializeServer(options?: ServerOptions) {
    try {
      // Initialize middleware and database
      this.app = express();

      // Apply custom middlewares if provided
      if (options?.middlewares) {
        logger.debug('Applying custom middlewares...');
        for (const middleware of options.middlewares) {
          this.app.use(middleware);
        }
      }

      // Setup middleware for all requests
      logger.debug('Setting up standard middlewares...');
      this.app.use(cors()); // Enable CORS first
      this.app.use(bodyParser.json()); // Parse JSON bodies

      // Optional Authentication Middleware
      const serverAuthToken = process.env.ELIZA_SERVER_AUTH_TOKEN;
      if (serverAuthToken) {
        logger.info('Server authentication enabled. Requires X-API-KEY header for /api routes.');
        // Apply middleware only to /api paths
        this.app.use('/api', (req, res, next) => {
          apiKeyAuthMiddleware(req, res, next);
        });
      } else {
        logger.warn(
          'Server authentication is disabled. Set ELIZA_SERVER_AUTH_TOKEN environment variable to enable.'
        );
      }

      const uploadsPath = path.join(process.cwd(), '/data/uploads');
      const generatedPath = path.join(process.cwd(), '/generatedImages');
      fs.mkdirSync(uploadsPath, { recursive: true });
      fs.mkdirSync(generatedPath, { recursive: true });

      this.app.use('/media/uploads', express.static(uploadsPath));
      this.app.use('/media/generated', express.static(generatedPath));

      // Add specific middleware to handle portal assets
      // This needs to be before the static middleware
      this.app.use((req, res, next) => {
        // Automatically detect and handle static assets based on file extension
        const ext = path.extname(req.path).toLowerCase();

        // Set correct content type based on file extension
        if (ext === '.js' || ext === '.mjs') {
          res.setHeader('Content-Type', 'application/javascript');
        } else if (ext === '.css') {
          res.setHeader('Content-Type', 'text/css');
        } else if (ext === '.svg') {
          res.setHeader('Content-Type', 'image/svg+xml');
        } else if (ext === '.png') {
          res.setHeader('Content-Type', 'image/png');
        } else if (ext === '.jpg' || ext === '.jpeg') {
          res.setHeader('Content-Type', 'image/jpeg');
        }

        // Continue processing
        next();
      });

      // Setup static file serving with proper MIME types
      const staticOptions = {
        etag: true,
        lastModified: true,
        setHeaders: (res: express.Response, filePath: string) => {
          // Set the correct content type for different file extensions
          const ext = path.extname(filePath).toLowerCase();
          if (ext === '.css') {
            res.setHeader('Content-Type', 'text/css');
          } else if (ext === '.js') {
            res.setHeader('Content-Type', 'application/javascript');
          } else if (ext === '.html') {
            res.setHeader('Content-Type', 'text/html');
          } else if (ext === '.png') {
            res.setHeader('Content-Type', 'image/png');
          } else if (ext === '.jpg' || ext === '.jpeg') {
            res.setHeader('Content-Type', 'image/jpeg');
          } else if (ext === '.svg') {
            res.setHeader('Content-Type', 'image/svg+xml');
          }
        },
      };

      // Serve static assets from the client dist path
      const clientPath = path.join(__dirname, '..', 'dist');

      // *** NEW: Mount the plugin route handler BEFORE static serving ***
      const pluginRouteHandler = createPluginRouteHandler(this.agents);
      this.app.use(pluginRouteHandler);

      // Mount the core API router under /api
      // API Router setup
      const apiRouter = createApiRouter(this.agents, this);
      this.app.use(
        '/api',
        (req, res, next) => {
          logger.debug(`API request: ${req.method} ${req.path}`);
          next();
        },
        apiRouter,
        (err, req, res, next) => {
          logger.error(`API error: ${req.method} ${req.path}`, err);
          res.status(500).json({
            success: false,
            error: {
              message: err.message || 'Internal Server Error',
              code: err.code || 500,
            },
          });
        }
      );

      // *** Mount client static serving AFTER plugin routes and /api ***
      this.app.use('/', express.static(clientPath, staticOptions));

      // Add a catch-all route for API 404s
      this.app.use('/api/*', (req, res) => {
        logger.warn(`API 404: ${req.method} ${req.path}`);
        res.status(404).json({
          success: false,
          error: {
            message: 'API endpoint not found',
            code: 404,
          },
        });
      });

      // Main fallback for the SPA - must be registered after all other routes
      // For Express 4, we need to use the correct method for fallback routes
      // @ts-ignore - Express 4 type definitions are incorrect for .all()
      this.app.all('*' /* Removed check for /api here, should be caught earlier */, (req, res) => {
        // Skip media routes handled by static middleware earlier
        if (req.path.startsWith('/media')) {
          return res.status(404).send('Not found');
        }

        // For JavaScript requests that weren't handled by static middleware,
        // return a JavaScript response instead of HTML
        if (
          req.path.endsWith('.js') ||
          req.path.includes('.js?') ||
          req.path.match(/\/[a-zA-Z0-9_-]+-[A-Za-z0-9]{8}\.js/)
        ) {
          res.setHeader('Content-Type', 'application/javascript');
          return res.status(404).send(`// JavaScript module not found: ${req.path}`);
        }

        // For all other routes, serve the SPA's index.html
        res.sendFile(path.join(clientPath, 'index.html'));
      });

      // Create HTTP server for Socket.io
      this.server = http.createServer(this.app);

      // Initialize Socket.io
      this.socketIO = setupSocketIO(this.server, this.agents);

      logger.success('AgentServer initialization complete');
    } catch (error) {
      logger.error('Failed to complete server initialization:', error);
      throw error;
    }
  }

  /**
   * Registers an agent with the provided runtime.
   *
   * @param {IAgentRuntime} runtime - The runtime object containing agent information.
   * @throws {Error} if the runtime is null/undefined, if agentId is missing, if character configuration is missing,
   * or if there are any errors during registration.
   */
  public registerAgent(runtime: IAgentRuntime) {
    try {
      if (!runtime) {
        throw new Error('Attempted to register null/undefined runtime');
      }
      if (!runtime.agentId) {
        throw new Error('Runtime missing agentId');
      }
      if (!runtime.character) {
        throw new Error('Runtime missing character configuration');
      }

      // Register the agent
      this.agents.set(runtime.agentId, runtime);
      logger.debug(`Agent ${runtime.character.name} (${runtime.agentId}) added to agents map`);

      // Register TEE plugin if present
      const teePlugin = runtime.plugins.find((p) => p.name === 'phala-tee-plugin');
      if (teePlugin) {
        logger.debug(`Found TEE plugin for agent ${runtime.agentId}`);
        for (const provider of teePlugin.providers) {
          runtime.registerProvider(provider);
          logger.debug(`Registered TEE provider: ${provider.name}`);
        }
        for (const action of teePlugin.actions) {
          runtime.registerAction(action);
          logger.debug(`Registered TEE action: ${action.name}`);
        }
      }

      // Register routes
      logger.debug(
        `Registering ${runtime.routes.length} custom routes for agent ${runtime.character.name} (${runtime.agentId})`
      );
      for (const route of runtime.routes) {
        const routePath = route.path;
        try {
          switch (route.type) {
            case 'STATIC':
              this.app.get(routePath, (req, res) => route.handler(req, res, runtime));
              break;
            case 'GET':
              this.app.get(routePath, (req, res) => route.handler(req, res, runtime));
              break;
            case 'POST':
              this.app.post(routePath, (req, res) => route.handler(req, res, runtime));
              break;
            case 'PUT':
              this.app.put(routePath, (req, res) => route.handler(req, res, runtime));
              break;
            case 'DELETE':
              this.app.delete(routePath, (req, res) => route.handler(req, res, runtime));
              break;
            default:
              logger.error(`Unknown route type: ${route.type} for path ${routePath}`);
              continue;
          }
          logger.debug(`Registered ${route.type} route: ${routePath}`);
        } catch (error) {
          logger.error(`Failed to register route ${route.type} ${routePath}:`, error);
          throw error;
        }
      }

      logger.success(
        `Successfully registered agent ${runtime.character.name} (${runtime.agentId})`
      );
    } catch (error) {
      logger.error('Failed to register agent:', error);
      throw error;
    }
  }

  /**
   * Unregisters an agent from the system.
   *
   * @param {UUID} agentId - The unique identifier of the agent to unregister.
   * @returns {void}
   */
  public unregisterAgent(agentId: UUID) {
    if (!agentId) {
      logger.warn('[AGENT UNREGISTER] Attempted to unregister undefined or invalid agent runtime');
      return;
    }

    try {
      // Retrieve the agent before deleting it from the map
      const agent = this.agents.get(agentId);

      if (agent) {
        // Stop all services of the agent before unregistering it
        try {
          agent.stop().catch((stopError) => {
            logger.error(
              `[AGENT UNREGISTER] Error stopping agent services for ${agentId}:`,
              stopError
            );
          });
          logger.debug(`[AGENT UNREGISTER] Stopping services for agent ${agentId}`);
        } catch (stopError) {
          logger.error(`[AGENT UNREGISTER] Error initiating stop for agent ${agentId}:`, stopError);
        }
      }

      // Delete the agent from the map
      this.agents.delete(agentId);
      logger.debug(`Agent ${agentId} removed from agents map`);
    } catch (error) {
      logger.error(`Error removing agent ${agentId}:`, error);
    }
  }

  /**
   * Add middleware to the server's request handling pipeline
   * @param {ServerMiddleware} middleware - The middleware function to be registered
   */
  public registerMiddleware(middleware: ServerMiddleware) {
    this.app.use(middleware);
  }

  /**
   * Starts the server on the specified port.
   *
   * @param {number} port - The port number on which the server should listen.
   * @throws {Error} If the port is invalid or if there is an error while starting the server.
   */
  public start(port: number) {
    try {
      if (!port || typeof port !== 'number') {
        throw new Error(`Invalid port number: ${port}`);
      }

      this.serverPort = port; // Save the port

      logger.debug(`Starting server on port ${port}...`);
      logger.debug(`Current agents count: ${this.agents.size}`);
      logger.debug(`Environment: ${process.env.NODE_ENV}`);
      logger.debug(`Running in CI: ${process.env.CI ? 'Yes' : 'No'}`);

      // Use http server instead of app.listen
      this.server.listen(port, () => {
        // Display the dashboard URL with the correct port after the server is actually listening
        console.log(
          `\x1b[32mStartup successful!\nGo to the dashboard at \x1b[1mhttp://localhost:${port}\x1b[22m\x1b[0m`
        );
        // Add log for test readiness
        console.log(`AgentServer is listening on port ${port}`);

        logger.success(
          `REST API bound to 0.0.0.0:${port}. If running locally, access it at http://localhost:${port}.`
        );
        logger.debug(`Active agents: ${this.agents.size}`);
        this.agents.forEach((agent, id) => {
          logger.debug(`- Agent ${id}: ${agent.character.name}`);
        });
      });

      // Enhanced graceful shutdown
      const gracefulShutdown = async () => {
        logger.info('Received shutdown signal, initiating graceful shutdown...');

        // Stop all agents first
        logger.debug('Stopping all agents...');
        for (const [id, agent] of this.agents.entries()) {
          try {
            agent.stop();
            logger.debug(`Stopped agent ${id}`);
          } catch (error) {
            logger.error(`Error stopping agent ${id}:`, error);
          }
        }

        // Close server
        this.server.close(() => {
          logger.success('Server closed successfully');
          process.exit(0);
        });

        // Force close after timeout
        setTimeout(() => {
          logger.error('Could not close connections in time, forcing shutdown');
          process.exit(1);
        }, 5000);
      };

      process.on('SIGTERM', gracefulShutdown);
      process.on('SIGINT', gracefulShutdown);

      logger.debug('Shutdown handlers registered');
    } catch (error) {
      logger.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stops the server if it is running. Closes the server connection,
   * stops the database connection, and logs a success message.
   */
  public async stop() {
    if (this.server) {
      this.server.close(() => {
        this.database.close();
        logger.success('Server stopped');
      });
    }
  }
}

// Helper function to expand tilde in paths
function expandTildePath(filepath: string): string {
  if (filepath && typeof filepath === 'string' && filepath.startsWith('~')) {
    return filepath.replace(/^~/, os.homedir());
  }
  return filepath;
}
