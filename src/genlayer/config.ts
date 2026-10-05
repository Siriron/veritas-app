// ────────────────────────────────────────────────────────────────────────────
// VERITAS – GenLayer network config
// ────────────────────────────────────────────────────────────────────────────

export const STUDIONET_RPC = "https://studio.genlayer.com/api";

export const STUDIONET_CONFIG = {
  chainId: "0xF22F", // 61999
  chainName: "GenLayer StudioNet",
  rpcUrls: [STUDIONET_RPC],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
} as const;

export const STUDIONET_CHAIN_ID = 61999;

/**
 * Paste the deployed VeritasDisputes contract address here.
 *
 * HOW TO DEPLOY:
 *   1. Open https://studio.genlayer.com
 *   2. Connect MetaMask (add GenLayer StudioNet: chainId 61999, RPC https://studio.genlayer.com/api)
 *   3. Click "Deploy Contract" → paste the contents of contracts/VeritasDisputes.py
 *   4. No constructor args needed — click Deploy
 *   5. Copy the deployed address and replace the zero address below
 */
export const CONTRACT_ADDRESS = "0xd4972C7A49D5D3Ca3eB307DA7faA97294fA303ff";

export const EXPLORER_TX_URL = (hash: string) =>
  `https://explorer-studio.genlayer.com/tx/${hash}`;

export const EXPLORER_ADDR_URL = (addr: string) =>
  `https://explorer-studio.genlayer.com/address/${addr}`;
