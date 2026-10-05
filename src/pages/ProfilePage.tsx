import { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@/genlayer/useWallet";
import { CONTRACT_ADDRESS } from "@/genlayer/config";
import { StatusBadge } from "@/components/StatusBadge";
import { shortAddr, formatGen, formatTs } from "@/utils/format";
import type { Dispute, Claim } from "@/genlayer/types";
import { Wallet, Info, ExternalLink } from "lucide-react";

const isDemo = CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000";

interface ActivityItem {
  dispute: Dispute;
  claim?: Claim;
}

export default function ProfilePage() {
  const { address, isConnected, connect } = useWallet();
  const [items] = useState<ActivityItem[]>([]);
  const [error] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <div
        style={{
          maxWidth: 600,
          margin: "80px auto",
          padding: "0 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--accent-dim)",
            border: "1px solid var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Wallet size={22} color="var(--accent)" />
        </div>
        <h1 style={{ margin: 0, fontSize: 22 }}>My Activity</h1>
        <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 14, maxWidth: 360 }}>
          Connect your wallet to see the disputes you created and claims you filed.
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => void connect()}>
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: 32 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--accent-dim)",
            border: "1px solid var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Wallet size={18} color="var(--accent)" />
        </div>
        <div>
          <h1 style={{ margin: "0 0 2px", fontSize: 20 }}>My Activity</h1>
          <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            {address}
          </span>
        </div>
      </div>

      {isDemo && (
        <div className="alert alert-info" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            Demo mode — set CONTRACT_ADDRESS in{" "}
            <code className="mono" style={{ fontSize: 11 }}>src/genlayer/config.ts</code> to track your
            onchain activity.
          </div>
        </div>
      )}

      {!isDemo && (
        <div className="alert alert-info" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            GenLayer does not offer a global dispute index directly over RPC without a backend
            indexer. Use the{" "}
            <a
              href={`https://explorer-studio.genlayer.com`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              GenLayer Explorer <ExternalLink size={11} style={{ verticalAlign: "middle" }} />
            </a>{" "}
            to find disputes associated with your address, then navigate to them directly.
            <br />
            Your address:{" "}
            <a
              href={`https://explorer-studio.genlayer.com/address/${address}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}
            >
              {shortAddr(address)}
              <ExternalLink size={10} style={{ verticalAlign: "middle", marginLeft: 3 }} />
            </a>
          </div>
        </div>
      )}

      {/* Quick stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { label: "Connected Address", value: shortAddr(address) },
          { label: "Network", value: "GenLayer StudioNet" },
          { label: "Contract", value: isDemo ? "Not deployed" : shortAddr(CONTRACT_ADDRESS) },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 6 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: "var(--accent)" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link to="/create" className="btn btn-primary" style={{ textDecoration: "none" }}>
          File a Dispute
        </Link>
        <Link to="/" className="btn btn-secondary" style={{ textDecoration: "none" }}>
          Browse All Disputes
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}



      {items.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="mono" style={{ margin: 0, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--fg-muted)" }}>
            Your Disputes & Claims
          </h2>
          {items.map(({ dispute, claim }) => (
            <Link
              key={dispute.dispute_id}
              to={`/dispute/${dispute.dispute_id}`}
              style={{ textDecoration: "none" }}
            >
              <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <StatusBadge status={dispute.status} />
                  {claim && <StatusBadge status={claim.status} />}
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>
                    {dispute.idea_title}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", gap: 16 }}>
                  <span>{formatTs(dispute.created_ts)}</span>
                  <span>Pool: {formatGen(dispute.stake_pool_deposited)} GEN</span>
                  {claim && <span>Stake: {formatGen(claim.stake_deposited)} GEN</span>}
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
