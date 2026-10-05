// ────────────────────────────────────────────────────────────────────────────
// VERITAS – wallet state hook (window.ethereum, no external kit)
// Confirmed pattern from reference: silent reconnect on mount + accountsChanged.
// ────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { STUDIONET_CHAIN_ID } from "./config";
import { ensureChain } from "./client";

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  isOnCorrectNetwork: boolean;
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const eth = typeof window !== "undefined"
    ? ((window as unknown as Record<string, unknown>).ethereum as
        | {
            request: (r: unknown) => Promise<unknown>;
            on?: (event: string, handler: (v: unknown) => void) => void;
            removeListener?: (event: string, handler: (v: unknown) => void) => void;
          }
        | undefined)
    : undefined;

  // Reconnect silently on mount without prompting
  useEffect(() => {
    if (!eth) return;
    eth.request({ method: "eth_accounts" })
      .then((accounts) => {
        const accs = accounts as string[];
        if (accs[0]) setAddress(accs[0]);
      })
      .catch(() => {});

    eth.request({ method: "eth_chainId" })
      .then((id) => setChainId(parseInt(id as string, 16)))
      .catch(() => {});

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      setAddress(accs[0] ?? null);
    };
    const handleChainChanged = (id: unknown) => {
      setChainId(parseInt(id as string, 16));
    };

    eth.on?.("accountsChanged", handleAccountsChanged);
    eth.on?.("chainChanged", handleChainChanged);
    return () => {
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
      eth.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [eth]);

  const connect = useCallback(async () => {
    if (!eth) {
      alert("No wallet detected. Install MetaMask or another EVM wallet extension.");
      return;
    }
    setIsConnecting(true);
    try {
      await ensureChain();
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0] ?? null);
      const id = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(parseInt(id, 16));
    } finally {
      setIsConnecting(false);
    }
  }, [eth]);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    await ensureChain();
    const id = (await eth?.request({ method: "eth_chainId" })) as string | undefined;
    if (id) setChainId(parseInt(id, 16));
  }, [eth]);

  return {
    address,
    chainId,
    isConnected: !!address,
    isConnecting,
    isOnCorrectNetwork: chainId === STUDIONET_CHAIN_ID,
    hasWallet: !!eth,
    connect,
    disconnect,
    switchNetwork,
  };
}
