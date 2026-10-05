import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { shortAddr, formatGen, formatCountdown } from "@/utils/format";
import type { Dispute } from "@/genlayer/types";
import { VeritasContract } from "@/genlayer/client";
import { CONTRACT_ADDRESS } from "@/genlayer/config";
import { ArrowRight, Zap, Eye, Award, RefreshCw, Loader2 } from "lucide-react";

const LIFECYCLE_STEPS = [
  { icon: Zap,        label: "Filing Open",      desc: "Competing claims pinned to one artifact each" },
  { icon: Eye,        label: "Validating",        desc: "Independent fetch + LLM match on every validator" },
  { icon: ArrowRight, label: "Challenge Window",  desc: "Additive-only provenance, no artifact swaps" },
  { icon: Award,      label: "Finalized",         desc: "Deterministic payout via pull-based withdrawal" },
];

export default function HomePage() {
  const [disputes, setDisputes]   = useState<Dispute[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const contract = new VeritasContract(CONTRACT_ADDRESS);
      const all = await contract.getAllDisputes();
      setDisputes(all);
      setLastFetch(Date.now());
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? "Failed to load disputes.");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

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
            File a Dispute <ArrowRight size={15} />
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 className="mono" style={{ margin: 0, fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--fg-muted)" }}>
              Live Disputes
            </h2>
            {lastFetch > 0 && (
              <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)" }}>
                {disputes.length} dispute{disputes.length !== 1 ? "s" : ""} loaded
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { void load(); }}
              disabled={loading}
              title="Refresh"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
            <Link to="/create" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
              + New
            </Link>
          </div>
        </div>

        {/* Loading state */}
        {loading && disputes.length === 0 && (
          <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--fg-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)" }} />
            <p style={{ margin: 0, fontSize: 13 }}>Loading disputes from contract…</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: "center" }} onClick={() => { void load(); }}>
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && disputes.length === 0 && (
          <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--fg-muted)" }}>
            <p style={{ margin: 0 }}>No disputes filed yet.</p>
            <Link to="/create" style={{ color: "var(--accent)", fontSize: 13, textDecoration: "none" }}>
              Be the first to file one.
            </Link>
          </div>
        )}

        {/* Dispute table */}
        {disputes.length > 0 && (
          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-03)" }}>
                  {["Idea", "Status", "Claims", "Pool", "Filing Closes"].map((col) => (
                    <th key={col} style={{
                      padding: "10px 16px", textAlign: "left",
                      fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                      letterSpacing: "0.1em", textTransform: "uppercase",
                      color: "var(--fg-muted)", fontWeight: 500,
                      borderBottom: "1px solid var(--border)",
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {disputes.map((d, i) => (
                  <tr key={d.dispute_id} style={{
                    borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                    transition: "background 0.1s", cursor: "pointer",
                  }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-03)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <Link to={`/dispute/${d.dispute_id}`} style={{ color: "var(--fg)", textDecoration: "none", fontWeight: 500, display: "block" }}>
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
      </section>
    </div>
  );
}
