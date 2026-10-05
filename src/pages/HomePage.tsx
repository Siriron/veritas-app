import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { shortAddr, formatGen, formatCountdown } from "@/utils/format";
import type { Dispute } from "@/genlayer/types";
import { ArrowRight, Zap, Eye, Award } from "lucide-react";

// ── Static demo disputes shown when contract address is not yet set ─────────
const DEMO: Dispute[] = [
  {
    dispute_id: "dispute:0",
    creator: "0xabc1234567890000000000000000000000000000",
    idea_title: "Incremental Dictionary Rollup Compression",
    idea_description: "A method for compressing rollup batch data using streaming dictionaries.",
    status: "FINALIZED",
    required_stake_wei: 10n ** 16n,
    stake_pool_deposited: 3n * 10n ** 16n,
    claim_count: 3,
    created_ts: Math.floor(Date.now() / 1000) - 86400 * 5,
    filing_deadline_ts: Math.floor(Date.now() / 1000) - 86400 * 4,
    evaluation_timeout_ts: Math.floor(Date.now() / 1000) - 86400 * 2,
    leading_claim_id: "claim:0",
    ranking_verdict: "RANKED_WINNER",
    ranking_rationale: "",
    ranked_ts: Math.floor(Date.now() / 1000) - 86400,
    challenge_deadline_ts: Math.floor(Date.now() / 1000) - 3600,
    had_challenge_evidence: false,
    final_winner_claim_id: "claim:0",
    finalized_ts: Math.floor(Date.now() / 1000) - 1800,
  },
  {
    dispute_id: "dispute:1",
    creator: "0xdef9876543210000000000000000000000000000",
    idea_title: "Zero-Knowledge Email Verification Protocol",
    idea_description: "Prove you control an email address without revealing the address onchain.",
    status: "FILING_OPEN",
    required_stake_wei: 5n * 10n ** 15n,
    stake_pool_deposited: 10n ** 16n,
    claim_count: 2,
    created_ts: Math.floor(Date.now() / 1000) - 3600,
    filing_deadline_ts: Math.floor(Date.now() / 1000) + 86400,
    evaluation_timeout_ts: Math.floor(Date.now() / 1000) + 86400 * 3,
    leading_claim_id: "",
    ranking_verdict: "",
    ranking_rationale: "",
    ranked_ts: 0,
    challenge_deadline_ts: 0,
    had_challenge_evidence: false,
    final_winner_claim_id: "",
    finalized_ts: 0,
  },
];

const LIFECYCLE_STEPS = [
  { icon: Zap, label: "Filing Open", desc: "Competing claims pinned to one artifact each" },
  { icon: Eye, label: "Validating", desc: "Independent fetch + LLM match on every validator" },
  { icon: ArrowRight, label: "Challenge Window", desc: "Additive-only provenance, no artifact swaps" },
  { icon: Award, label: "Finalized", desc: "Deterministic payout via pull-based withdrawal" },
];

export default function HomePage() {
  const isDemo = false; // contract is deployed
  const disputes: Dispute[] = isDemo ? DEMO : [];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: 48 }}>

      {/* ── Hero ── */}
      <section style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 20 }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.2em", color: "var(--fg-muted)", textTransform: "uppercase" }}>
          Onchain priority-dispute resolution · GenLayer StudioNet
        </p>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.1, margin: 0 }}>
          Claim you made it first.
          <br />
          <span style={{ color: "var(--accent)" }}>Let validators decide.</span>
        </h1>
        <p style={{ maxWidth: 560, margin: "0 auto", color: "var(--fg-muted)", fontSize: 15, lineHeight: 1.7 }}>
          Two or more parties stake GEN claiming priority over the same idea. Each claim pins
          one public artifact at filing time. GenLayer validators independently verify timing
          against third-party provenance — never a self-reported date.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/create" className="btn btn-primary btn-lg" style={{ textDecoration: "none" }}>
            File a Dispute
            <ArrowRight size={15} />
          </Link>
          <a href="#feed" className="btn btn-secondary btn-lg" style={{ textDecoration: "none" }}>
            View Disputes
          </a>
        </div>
      </section>

      {/* ── Lifecycle strip ── */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {LIFECYCLE_STEPS.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon size={14} color="var(--accent)" />
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)" }}>
                {label}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>{desc}</p>
          </div>
        ))}
      </section>

      {/* ── Dispute feed ── */}
      <section id="feed" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="mono" style={{ margin: 0, fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--fg-muted)" }}>
            {isDemo ? "Demo Disputes (deploy the contract to see live data)" : "Live Disputes"}
          </h2>
          <Link to="/create" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
            + New
          </Link>
        </div>

        {disputes.length === 0 && (
          <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--fg-muted)" }}>
            <p style={{ margin: 0 }}>No disputes filed yet.</p>
            <Link to="/create" style={{ color: "var(--accent)", fontSize: 13, textDecoration: "none" }}>
              Be the first to file one.
            </Link>
          </div>
        )}

        {disputes.length > 0 && (
          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-03)" }}>
                  {["Idea", "Status", "Claims", "Pool", "Filing Closes"].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--fg-muted)",
                        fontWeight: 500,
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {disputes.map((d, i) => (
                  <tr
                    key={d.dispute_id}
                    style={{
                      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      transition: "background 0.1s",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-03)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <Link
                        to={`/dispute/${d.dispute_id}`}
                        style={{ color: "var(--fg)", textDecoration: "none", fontWeight: 500, display: "block" }}
                      >
                        {d.idea_title}
                      </Link>
                      <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                        by {shortAddr(d.creator)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <StatusBadge status={d.status} />
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: "var(--fg-muted)" }}>
                      {d.claim_count}
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: "var(--fg-muted)" }}>
                      {formatGen(d.stake_pool_deposited)} GEN
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--fg-muted)" }}>
                      {d.status === "FILING_OPEN" ? formatCountdown(d.filing_deadline_ts) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isDemo && (
          <p style={{ fontSize: 12, color: "var(--fg-subtle)", textAlign: "center" }}>
            Demo data above. Set CONTRACT_ADDRESS in{" "}
            <code className="mono" style={{ fontSize: 11 }}>src/genlayer/config.ts</code>{" "}
            after deploying your GenLayer contract to go live.
          </p>
        )}
      </section>
    </div>
  );
}
