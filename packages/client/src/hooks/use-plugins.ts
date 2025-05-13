import { useQuery } from '@tanstack/react-query';

/**
 * Fetches and returns a list of available plugin names using a query hook.
 *
 * The returned list includes only plugin identifiers containing the substring "plugin", sorted alphabetically.
 *
 * @returns The result of the query containing the filtered and sorted plugin names.
 *
 * @remark The plugin list is currently hardcoded and not fetched from the remote registry.
 */
export function usePlugins() {
  return useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      // TODO: Temp disabled!
      // const response = await fetch(
      //   'https://raw.githubusercontent.com/elizaos/registry/refs/heads/main/index.json'
      // );
      // return response.json();

      // Temporarily return hardcoded plugins as an array
      return [
        '@elizaos/core',
        '@elizaos/plugin-bootstrap',
        '@elizaos/plugin-evm',
        '@elizaos/plugin-solana',
        '@elizaos/plugin-tee',
        '@elizaos/plugin-twitter',
        '@elizaos/plugin-openai',
        '@elizaos/plugin-telegram',
        '@elizaos/cli',
        '@elizaos/plugin-discord',
        '@elizaos/plugin-elevenlabs',
        '@elizaos/plugin-anthropic',
        '@elizaos/plugin-local-ai',
        '@elizaos/plugin-sql',
        '@elizaos/the-org',
        '@elizaos/plugin-browser',
        '@elizaos/plugin-video-understanding',
        '@elizaos/plugin-pdf',
        '@elizaos/plugin-storage-s3',
        '@elizaos/plugin-farcaster',
        '@elizaos/plugin-groq',
        '@elizaos/plugin-redpill',
        '@elizaos/plugin-ollama',
        '@elizaos/plugin-venice',
        '@fleek-platform/eliza-plugin-mcp',
      ]
        .filter((name) => name.includes('plugin'))
        .sort();
    },
  });
}
