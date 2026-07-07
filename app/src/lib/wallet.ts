import { useCallback, useEffect, useMemo, useState } from "react";
import { ADD_CHAIN_PARAMS, BRADBURY_CHAIN_ID_HEX } from "./config";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

export interface WalletState {
  provider: Eip1193Provider | null;
  address: `0x${string}` | null;
  chainId: string | null;
  onCorrectChain: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToBradbury: () => Promise<void>;
}

function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (!w.ethereum) return null;
  // If multiple providers are installed, prefer MetaMask-style; otherwise take the first.
  if (Array.isArray(w.ethereum.providers) && w.ethereum.providers.length > 0) {
    const mm = w.ethereum.providers.find((p: any) => p.isMetaMask);
    return mm ?? w.ethereum.providers[0];
  }
  return w.ethereum as Eip1193Provider;
}

const STORAGE_KEY = "counterclaim.wallet.connected";

export function useWallet(): WalletState {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grab the provider once. We don't auto-request accounts to keep the UX intentional.
  useEffect(() => {
    const p = getInjectedProvider();
    setProvider(p);
    if (!p) return;

    // If the user connected previously in this browser and the injected wallet
    // still exposes their account, re-hydrate silently.
    (async () => {
      try {
        const shouldRestore =
          typeof window !== "undefined" &&
          window.localStorage.getItem(STORAGE_KEY) === "1";
        if (!shouldRestore) return;

        const accounts = (await p.request({ method: "eth_accounts" })) as string[];
        if (accounts && accounts.length > 0) {
          setAddress(accounts[0] as `0x${string}`);
          const cid = (await p.request({ method: "eth_chainId" })) as string;
          setChainId(cid);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // silent
      }
    })();
  }, []);

  // Subscribe to wallet events (accounts / chain changes / disconnect).
  useEffect(() => {
    if (!provider?.on) return;

    const handleAccounts = (accs: string[]) => {
      if (!accs || accs.length === 0) {
        setAddress(null);
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {}
      } else {
        setAddress(accs[0] as `0x${string}`);
      }
    };
    const handleChain = (cid: string) => setChainId(cid);
    const handleDisconnect = () => {
      setAddress(null);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {}
    };

    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);
    provider.on("disconnect", handleDisconnect);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
      provider.removeListener?.("disconnect", handleDisconnect);
    };
  }, [provider]);

  const switchToBradbury = useCallback(async () => {
    if (!provider) throw new Error("no wallet installed");
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BRADBURY_CHAIN_ID_HEX }],
      });
    } catch (err: any) {
      // 4902 = chain not added. Add it and try again.
      if (err && (err.code === 4902 || err.code === -32603)) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [ADD_CHAIN_PARAMS],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BRADBURY_CHAIN_ID_HEX }],
        });
      } else {
        throw err;
      }
    }
    const cid = (await provider.request({ method: "eth_chainId" })) as string;
    setChainId(cid);
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) {
      setError(
        "No EVM wallet detected. Install MetaMask, Rabby, or another EIP-1193 wallet, then reload.",
      );
      return;
    }
    setError(null);
    setIsConnecting(true);
    try {
      const accs = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accs || accs.length === 0) throw new Error("wallet returned no accounts");
      setAddress(accs[0] as `0x${string}`);

      await switchToBradbury();
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {}
    } catch (err: any) {
      const code = err?.code;
      // 4001 = user rejected. Keep the message short and calm.
      if (code === 4001) {
        setError("Connection request rejected.");
      } else {
        setError(err?.message ?? String(err));
      }
    } finally {
      setIsConnecting(false);
    }
  }, [provider, switchToBradbury]);

  const disconnect = useCallback(() => {
    setAddress(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const onCorrectChain = useMemo(() => {
    return chainId?.toLowerCase() === BRADBURY_CHAIN_ID_HEX;
  }, [chainId]);

  return {
    provider,
    address,
    chainId,
    onCorrectChain,
    isConnected: Boolean(address),
    isConnecting,
    error,
    connect,
    disconnect,
    switchToBradbury,
  };
}
