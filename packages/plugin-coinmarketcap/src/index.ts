import type { Plugin } from '@elizaos/core-plugin-v1';
import getPrice from './actions/getPrice';

export const coinmarketcapPlugin: Plugin = {
  name: 'coinmarketcap',
  description: 'CoinMarketCap Plugin for Eliza',
  actions: [getPrice],
  evaluators: [],
  providers: [],
};

export default coinmarketcapPlugin;
