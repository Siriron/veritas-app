import { useWallet } from "@/genlayer/useWallet";
import { shortAddr } from "@/utils/format";
import { Wallet, AlertTriangle, Loader2 } from "lucide-react";

export function WalletButton() {
  const { address, isConnected, isConnecting, isOnCorrectNetwork, hasWallet, connect, switchNetwork } =
    useWallet();

  if (!hasWallet) {
    return (
      <a
        href="https://metamask.io"
        target="_blank"
        rel="noreferrer"
        className="btn btn-secondary btn-sm"
      >
        Install Wallet
      </a>
    );
  }

  if (isConnecting) {
    return (
      <button className="btn btn-secondary btn-sm" disabled>
        <Loader2 size={12} className="animate-spin" />
        Connecting…
      </button>
    );
  }

  if (!isConnected) {
    return (
      <button onClick={() => void connect()} className="btn btn-primary btn-sm">
        <Wallet size={13} />
        Connect Wallet
      </button>
    );
  }

  if (!isOnCorrectNetwork) {
    return (
      <button onClick={() => void switchNetwork()} className="btn btn-danger btn-sm">
        <AlertTriangle size={12} />
        Switch Network
      </button>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-03)",
        border: "1px solid var(--border-strong)",
        borderRadius: 4,
        padding: "4px 12px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
        color: "var(--accent)",
        letterSpacing: "0.05em",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--green)",
          flexShrink: 0,
        }}
      />
      {shortAddr(address)}
    </div>
  );
}
