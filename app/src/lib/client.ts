import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { getContractAddress } from "./config";

/**
 * Read-only client - no account attached, no wallet dependency.
 * Uses the public Bradbury RPC directly.
 */
export function makeReadClient() {
  return createClient({ chain: testnetBradbury });
}

/**
 * Writable client - signing is delegated to the injected EIP-1193 wallet.
 *
 * `account` is passed as a string address (not a viem Account object). This
 * makes genlayer-js's transport route provider methods
 * (eth_sendTransaction, eth_requestAccounts, ...) through the wallet.
 * Non-provider methods (gen_call, eth_getTransactionCount, ...) go direct
 * to the Bradbury RPC.
 *
 * Signing therefore uses the user's own key; the app never sees the key.
 */
export function makeWriteClient(address: string, provider: any) {
  return createClient({
    chain: testnetBradbury,
    account: address as `0x${string}`,
    provider,
  } as any);
}

export const CONTRACT_ADDRESS = getContractAddress();
