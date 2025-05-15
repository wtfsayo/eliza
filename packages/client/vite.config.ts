import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { type Plugin, type UserConfig, defineConfig, loadEnv } from 'vite';
import viteCompression from 'vite-plugin-compression';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import clientElizaLogger from './src/lib/logger';
// @ts-ignore:next-line
// @ts-ignore:next-line
import type { ViteUserConfig } from 'vitest/config'; // Import Vitest config type for test property

// https://vite.dev/config/

// Combine Vite's UserConfig with Vitest's config for the 'test' property
interface CustomUserConfig extends UserConfig {
  test?: ViteUserConfig['test'];
}

export default defineConfig(({ mode }): CustomUserConfig => {
  const envDir = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, envDir, '');

  // Custom plugin to filter out externalization warnings
  const filterExternalizationWarnings: Plugin = {
    name: 'filter-externalization-warnings',
    apply: 'build', // Only apply during build
    configResolved(config) {
      const originalLogFn = config.logger.info;
      config.logger.info = (msg, options) => {
        if (
          typeof msg === 'string' &&
          msg.includes('has been externalized for browser compatibility')
        ) {
          return; // Suppress the warning
        }
        originalLogFn(msg, options);
        // Also log to our custom logger
        clientElizaLogger.info(msg, options);
      };
    },
  };

  return {
    plugins: [
      react() as unknown as Plugin,
      viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 1024,
      }) as Plugin,
      filterExternalizationWarnings,
      nodePolyfills({
        // Explicitly include Buffer to ensure it's available in all environments
        globals: {
          Buffer: true,
        },
      }) as Plugin,
    ],
    clearScreen: false,
    envDir,
    define: {
      'import.meta.env.VITE_SERVER_PORT': JSON.stringify(env.SERVER_PORT || '3000'),
      // Always define Buffer for all environments
      'global.Buffer': 'Buffer',
    },
    build: {
      outDir: 'dist',
      minify: false,
      cssMinify: true,
      sourcemap: true,
      cssCodeSplit: true,
      rollupOptions: {
        external: ['cloudflare:sockets'],
        onwarn(warning, warn) {
          const message = typeof warning.message === 'string' ? warning.message : '';

          // Suppress specific warnings
          if (
            (warning.code === 'UNRESOLVED_IMPORT' &&
              /node:|fs|path|crypto|stream|tty|worker_threads|assert/.test(message)) ||
            message.includes('has been externalized for browser compatibility') ||
            message.includes("The 'this' keyword is equivalent to 'undefined'") ||
            warning.code === 'CIRCULAR_DEPENDENCY'
          ) {
            return; // Suppress these warnings
          }

          // For other warnings, use the default handler and log to custom logger
          warn(warning);
          clientElizaLogger.warn(message || 'Unknown warning');
        },
      },
    },
    resolve: {
      alias: {
        '@': '/src',
        buffer: 'buffer/',
      },
    },
    logLevel: 'error', // Only show errors, not warnings
    // Add Vitest configuration
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
      exclude: [
        'src/tests/**/*.{test,spec}.{js,ts,jsx,tsx}', // Exclude Playwright tests
        'node_modules/**',
        'dist/**',
        'cypress/**',
        '**/*.d.ts',
        '{playwright,vite,vitest}.config.{js,ts,jsx,tsx}',
      ],
      // Setup to provide Buffer globally
      setupFiles: './src/testSetup.ts',
    },
  };
});
