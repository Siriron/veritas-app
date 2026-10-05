import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { shortAddr, formatGen, formatTs, formatCountdown } from "@/utils/format";
import { useWallet } from "@/genlayer/useWallet";
import { VeritasContract, TimeoutError } from "@/genlayer/client";
import { CONTRACT_ADDRESS, EXPLORER_TX_URL } from "@/genlayer/config";
import type { Dispute, Claim } from "@/genlayer/types";
import { Loader2, ExternalLink, ChevronLeft, Info, AlertTriangle } from "lucide-react";

const PROVENANCE_OPTIONS = [
  { value: "WAYBACK", label: "Web Archive (Wayback Machine snapshot)" },
  { value: "GIT_COMMIT", label: "Git commit (GitHub/GitLab commit API)" },
  { value: "PLATFORM_PUBLISH", label: "Platform-reported publish metadata (Hacker News)" },
];

const SAMPLE_CLAIMS = {
  A: {
    label: "Sample A — GitHub commit (2012, earlier)",
    artifactUrl: "https://github.com/octocat/Hello-World/blob/master/README",
    provenanceType: "GIT_COMMIT",
    provenanceHintUrl:
      "https://api.github.com/repos/octocat/Hello-World/commits/7fd1a60b01f91b314f59955a4e4d4e80d8edf11",
  },
  B: {
    label: "Sample B — Wayback snapshot (later)",
    artifactUrl: "https://en.wikipedia.org/wiki/Blockchain",
    provenanceType: "WAYBACK",
    provenanceHintUrl: "",
  },
};

const SAMPLE_CHALLENGE_URL =
  "https://archive.org/wayback/available?url=en.wikipedia.org/wiki/Blockchain&timestamp=20100101";

const isDemo = CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000";

// ── Helper ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2
        className="mono"
        style={{
          margin: 0,
          fontSize: 10,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "var(--fg-muted)",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { address, isConnected } = useWallet();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeoutHash, setTimeoutHash] = useState<string | null>(null);

  const [artifactUrl, setArtifactUrl] = useState("");
  const [provenanceType, setProvenanceType] = useState("WAYBACK");
  const [provenanceHintUrl, setProvenanceHintUrl] = useState("");
  const [challengeUrls, setChallengeUrls] = useState<Record<string, string>>({});
  const [withdrawnIds, setWithdrawnIds] = useState<Set<string>>(new Set());
  const [optimisticClaimed, setOptimisticClaimed] = useState(false);

  function contract() {
    return isDemo || !id ? null : new VeritasContract(CONTRACT_ADDRESS, address);
  }

  const load = useCallback(async () => {
    if (!id || isDemo) { setLoading(false); return; }
    try {
      const c = new VeritasContract(CONTRACT_ADDRESS);
      const d = await c.getDispute(id);
      setDispute(d);
      const claimIds = await c.getDisputeClaimIds(id);
      const claimData = await Promise.all(claimIds.map((cid) => c.getClaim(cid)));
      setClaims(claimData);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message || "Failed to load dispute.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // eslint-disable-next-line react/set-state-in-effect -- intentional: load is an async fetcher that calls setState
  useEffect(() => { void load(); }, [load]);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setError(null);
    setTimeoutHash(null);
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e: unknown) {
      if (e instanceof TimeoutError) {
        setTimeoutHash(e.txHash);
        setError(e.message);
      } else {
        const err = e as { message?: string };
        setError(err?.message || "Transaction failed.");
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px", textAlign: "center", color: "var(--fg-muted)" }}>
        <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  if (isDemo || !dispute) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px" }}>
        <div className="alert alert-info" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            {isDemo
              ? "Set CONTRACT_ADDRESS in src/genlayer/config.ts and deploy the contract to view live disputes."
              : "Dispute not found."}
          </div>
        </div>
        <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 20, color: "var(--accent)", fontSize: 13, textDecoration: "none" }}>
          <ChevronLeft size={14} /> Back to disputes
        </Link>
      </div>
    );
  }

  // eslint-disable-next-line react/purity -- Date.now() is intentional for computing deadlines per render
  const now = Math.floor(Date.now() / 1000);
  const myClaim = claims.find((c) => c.claimant?.toLowerCase() === address?.toLowerCase());
  const isCreator = dispute.creator?.toLowerCase() === address?.toLowerCase();
  const filingClosed = now > dispute.filing_deadline_ts;
  const challengeClosed = now > dispute.challenge_deadline_ts;

  const canFileClaim = dispute.status === "FILING_OPEN" && isConnected && !myClaim && !optimisticClaimed;
  const canCancel = isCreator && dispute.status === "FILING_OPEN" && dispute.claim_count === 0;
  const canTriggerEval = dispute.status === "FILING_OPEN" && filingClosed && dispute.claim_count >= 2;
  const canSingleFilerRefund = dispute.status === "FILING_OPEN" && filingClosed && dispute.claim_count < 2;
  const canFinalize = dispute.status === "RANKED" && challengeClosed;
  const canTimeout =
    ["FILING_OPEN", "VALIDATING", "RANKED"].includes(dispute.status) &&
    now > dispute.evaluation_timeout_ts;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: 36 }}>

      {/* Back */}
      <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--fg-muted)", fontSize: 13, textDecoration: "none", width: "fit-content" }}>
        <ChevronLeft size={14} /> Disputes
      </Link>

      {/* Dispute header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <StatusBadge status={dispute.status} />
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>{dispute.dispute_id}</span>
        </div>
        <h1 style={{ margin: 0, fontSize: "clamp(20px, 3vw, 28px)" }}>{dispute.idea_title}</h1>
        <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 14, lineHeight: 1.65, maxWidth: 640 }}>
          {dispute.idea_description}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px" }} className="mono">
          {[
            `Creator: ${shortAddr(dispute.creator)}`,
            `Pool: ${formatGen(dispute.stake_pool_deposited)} GEN`,
            `Claims: ${dispute.claim_count}`,
            dispute.status === "FILING_OPEN" && `Filing closes: ${formatCountdown(dispute.filing_deadline_ts)}`,
            dispute.status === "RANKED" && `Challenge closes: ${formatCountdown(dispute.challenge_deadline_ts)}`,
            dispute.finalized_ts && `Finalized: ${formatTs(dispute.finalized_ts)}`,
          ].filter(Boolean).map((item) => (
            <span key={String(item)} style={{ fontSize: 11, color: "var(--fg-muted)" }}>{item}</span>
          ))}
        </div>
        {dispute.ranking_verdict && (
          <div className="alert alert-info" style={{ fontSize: 12 }}>
            Verdict: {dispute.ranking_verdict}
            {dispute.final_winner_claim_id ? ` — winner: ${shortAddr(dispute.final_winner_claim_id)}` : ""}
          </div>
        )}
      </div>

      {/* Errors */}
      {error && (
        <div className="alert alert-error" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            {error}
            {timeoutHash && (
              <a
                href={EXPLORER_TX_URL(timeoutHash)}
                target="_blank"
                rel="noreferrer"
                style={{ display: "block", marginTop: 4, color: "var(--accent)", fontSize: 11, textDecoration: "none" }}
              >
                View transaction <ExternalLink size={10} style={{ verticalAlign: "middle" }} />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Claims list */}
      <Section title={`Claims (${claims.length})`}>
        {claims.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-muted)" }}>No claims filed yet.</p>
        )}
        {claims.map((c) => {
          const isMyClaimHere = c.claimant?.toLowerCase() === address?.toLowerCase();
          const canWithdraw =
            isMyClaimHere &&
            (c.status === "WINNER" || c.status === "REFUNDED") &&
            c.stake_deposited > 0n &&
            !withdrawnIds.has(c.claim_id);
          const canChallenge =
            dispute.status === "RANKED" && isMyClaimHere && !challengeClosed;

          return (
            <div key={c.claim_id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusBadge status={c.status} />
                  <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                    {shortAddr(c.claimant)}
                    {isMyClaimHere && " (you)"}
                  </span>
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                  {formatGen(c.stake_deposited)} GEN staked
                </span>
              </div>

              <a
                href={c.artifact_url}
                target="_blank"
                rel="noreferrer noopener nofollow"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}
              >
                {c.artifact_url}
                <ExternalLink size={11} style={{ flexShrink: 0 }} />
              </a>

              <div className="mono" style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                <span>Provenance: {c.provenance_type}</span>
                {c.timestamp_verified && (
                  <span>Earliest: {formatTs(c.estimated_earliest_ts)}</span>
                )}
                {c.status !== "FILED" && (
                  <span>Match: {(c.match_score_bps / 100).toFixed(1)}%</span>
                )}
              </div>

              {c.evaluation_notes && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>
                  {c.evaluation_notes}
                </p>
              )}

              {canChallenge && (
                <div className="card-inner" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    Submit Additional Provenance (your claim only)
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="input"
                      style={{ fontSize: 12, height: 32 }}
                      placeholder="Evidence URL"
                      value={challengeUrls[c.claim_id] || ""}
                      onChange={(e) => setChallengeUrls((prev) => ({ ...prev, [c.claim_id]: e.target.value }))}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setChallengeUrls((prev) => ({ ...prev, [c.claim_id]: SAMPLE_CHALLENGE_URL }))}
                    >
                      Sample
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === `challenge-${c.claim_id}` || !contract()}
                      onClick={() => {
                        void withBusy(`challenge-${c.claim_id}`, async () => {
                          await contract()!.submitChallengeEvidence(c.claim_id, challengeUrls[c.claim_id] || "");
                        });
                      }}
                    >
                      {busy === `challenge-${c.claim_id}` ? <Loader2 size={12} className="animate-spin" /> : "Submit"}
                    </button>
                  </div>
                </div>
              )}

              {canWithdraw && (
                <button
                  className="btn btn-primary btn-sm"
                  style={{ alignSelf: "flex-start", marginTop: 4 }}
                  disabled={busy === `withdraw-${c.claim_id}` || !contract()}
                  onClick={() => {
                    void withBusy(`withdraw-${c.claim_id}`, async () => {
                      await contract()!.withdraw(c.claim_id);
                      setWithdrawnIds((prev) => new Set(prev).add(c.claim_id));
                    });
                  }}
                >
                  {busy === `withdraw-${c.claim_id}` ? <><Loader2 size={12} className="animate-spin" />Withdrawing…</> : "Withdraw"}
                </button>
              )}
            </div>
          );
        })}
      </Section>

      {/* File a claim */}
      {canFileClaim && (
        <Section title="File Your Claim">
          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-muted)", maxWidth: 480 }}>
                Sample A (GitHub, 2012) and Sample B (Wayback, later) are real independently-fetchable
                artifacts from different eras — useful for testing the earliest-wins ranking with two wallets.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setArtifactUrl(SAMPLE_CLAIMS.A.artifactUrl);
                  setProvenanceType(SAMPLE_CLAIMS.A.provenanceType);
                  setProvenanceHintUrl(SAMPLE_CLAIMS.A.provenanceHintUrl);
                }}>Sample A</button>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setArtifactUrl(SAMPLE_CLAIMS.B.artifactUrl);
                  setProvenanceType(SAMPLE_CLAIMS.B.provenanceType);
                  setProvenanceHintUrl(SAMPLE_CLAIMS.B.provenanceHintUrl);
                }}>Sample B</button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                Pinned Artifact URL (immutable once filed)
              </label>
              <input className="input" value={artifactUrl} onChange={(e) => setArtifactUrl(e.target.value)} placeholder="https://…" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Provenance Type
                </label>
                <select className="input" value={provenanceType} onChange={(e) => setProvenanceType(e.target.value)} style={{ appearance: "none" }}>
                  {PROVENANCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Provenance Hint URL {provenanceType === "GIT_COMMIT" ? "(required)" : "(optional)"}
                </label>
                <input
                  className="input"
                  value={provenanceHintUrl}
                  onChange={(e) => setProvenanceHintUrl(e.target.value)}
                  placeholder={provenanceType === "GIT_COMMIT" ? "https://api.github.com/repos/…/commits/sha" : ""}
                />
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ height: 44 }}
              disabled={busy === "file-claim" || !contract() || !artifactUrl}
              onClick={() => {
                void withBusy("file-claim", async () => {
                  await contract()!.fileClaim(
                    dispute.dispute_id,
                    artifactUrl.trim(),
                    provenanceType,
                    provenanceHintUrl.trim(),
                    dispute.required_stake_wei
                  );
                  setOptimisticClaimed(true);
                });
              }}
            >
              {busy === "file-claim" ? (
                <><Loader2 size={14} className="animate-spin" />Submitting…</>
              ) : (
                `Stake ${formatGen(dispute.required_stake_wei)} GEN & File Claim`
              )}
            </button>
          </div>
        </Section>
      )}

      {/* Lifecycle actions */}
      {(canCancel || canTriggerEval || canSingleFilerRefund || canFinalize || canTimeout) && (
        <Section title="Actions">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {canCancel && (
              <button
                className="btn btn-danger"
                disabled={busy === "cancel" || !contract()}
                onClick={() => { void withBusy("cancel", async () => { await contract()!.cancelDispute(dispute.dispute_id); }); }}
              >
                {busy === "cancel" ? <><Loader2 size={12} className="animate-spin" />Cancelling…</> : "Cancel Dispute"}
              </button>
            )}
            {canTriggerEval && (
              <button
                className="btn btn-primary"
                disabled={busy === "trigger" || !contract()}
                onClick={() => { void withBusy("trigger", async () => { await contract()!.triggerEvaluation(dispute.dispute_id); }); }}
              >
                {busy === "trigger" ? (
                  <><Loader2 size={12} className="animate-spin" />Running Validator Consensus… (may take several minutes)</>
                ) : "Trigger Evaluation"}
              </button>
            )}
            {canFinalize && (
              <button
                className="btn btn-primary"
                disabled={busy === "finalize" || !contract()}
                onClick={() => { void withBusy("finalize", async () => { await contract()!.finalizeDispute(dispute.dispute_id); }); }}
              >
                {busy === "finalize" ? <><Loader2 size={12} className="animate-spin" />Finalizing…</> : "Finalize Dispute"}
              </button>
            )}
            {canSingleFilerRefund && (
              <button
                className="btn btn-secondary"
                disabled={busy === "single-refund" || !contract()}
                onClick={() => { void withBusy("single-refund", async () => { await contract()!.claimSingleFilerRefund(dispute.dispute_id); }); }}
              >
                {busy === "single-refund" ? <><Loader2 size={12} className="animate-spin" />Processing…</> : "Claim Single-Filer Refund"}
              </button>
            )}
            {canTimeout && (
              <button
                className="btn btn-secondary"
                disabled={busy === "timeout" || !contract()}
                onClick={() => { void withBusy("timeout", async () => { await contract()!.claimDisputeTimeout(dispute.dispute_id); }); }}
              >
                {busy === "timeout" ? <><Loader2 size={12} className="animate-spin" />Processing…</> : "Claim Timeout Refund"}
              </button>
            )}
          </div>
          {(busy === "trigger" || busy === "finalize") && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--amber)" }}>
              GenLayer consensus can take several minutes — please keep this page open.
            </p>
          )}
        </Section>
      )}
    </div>
  );
}
