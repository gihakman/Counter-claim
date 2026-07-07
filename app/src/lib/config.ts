/**
 * Baked-in deployment metadata so the hosted site works with zero env config.
 * The address can be overridden via VITE_COUNTERCLAIM_ADDRESS at build time
 * without redeploying the contract.
 */

export const BRADBURY_CHAIN_ID = 4221;
export const BRADBURY_CHAIN_ID_HEX = "0x107d";
export const BRADBURY_RPC = "https://rpc-bradbury.genlayer.com";
export const BRADBURY_EXPLORER = "https://explorer-bradbury.genlayer.com";

// The deployed Counterclaim contract on Bradbury. Baked in so the hosted app
// works out of the box. Override at build time with VITE_COUNTERCLAIM_ADDRESS.
export const DEFAULT_CONTRACT_ADDRESS = "0x3FD5049B60FF5F78a85689BB37Ec3A2F86D1AEE1";

export function getContractAddress(): `0x${string}` {
  const envAddr = (import.meta as any).env?.VITE_COUNTERCLAIM_ADDRESS as string | undefined;
  const raw = (envAddr && envAddr.length > 0 ? envAddr : DEFAULT_CONTRACT_ADDRESS).trim();
  return raw as `0x${string}`;
}

export function explorerTx(hash: string): string {
  return `${BRADBURY_EXPLORER}/tx/${hash}`;
}

export function explorerAddress(addr: string): string {
  return `${BRADBURY_EXPLORER}/address/${addr}`;
}

// The rpcUrls, chain name, and currency values used by wallet_addEthereumChain.
export const ADD_CHAIN_PARAMS = {
  chainId: BRADBURY_CHAIN_ID_HEX,
  chainName: "GenLayer Bradbury Testnet",
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  rpcUrls: [BRADBURY_RPC],
  blockExplorerUrls: [BRADBURY_EXPLORER],
};
