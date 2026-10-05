import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/genlayer/useWallet";
import { VeritasContract, genToWei } from "@/genlayer/client";
import { CONTRACT_ADDRESS } from "@/genlayer/config";
import { Info, Loader2 } from "lucide-react";

const FILING_WINDOWS = [
  { label: "24 hours", seconds: 86400 },
  { label: "48 hours (default)", seconds: 172800 },
  { label: "7 days", seconds: 604800 },
];

const CHALLENGE_WINDOWS = [
  { label: "6 hours", seconds: 21600 },
  { label: "24 hours (default)", seconds: 86400 },
  { label: "3 days", seconds: 259200 },
];

const SAMPLE = {
  title: "Streaming Rollup Compression via Incremental Dictionaries",
  description:
    "A method for compressing rollup batch data using streaming dictionaries computed " +
    "incrementally over the previous 24 hours of transactions, reducing L1 " +
    "data-availability costs without a trusted setup. Covers the specific mechanism of " +
    "rebuilding the dictionary window on every batch rather than a static, precomputed one.",
  stakeGen: "0.01",
  filingSeconds: 86400,
  challengeSeconds: 21600,
};

export default function CreateDisputePage() {
  const navigate = useNavigate();
  const { address, isConnected, isOnCorrectNetwork } = useWallet();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stakeGen, setStakeGen] = useState("1");
  const [filingSeconds, setFilingSeconds] = useState(FILING_WINDOWS[1].seconds);
  const [challengeSeconds, setChallengeSeconds] = useState(CHALLENGE_WINDOWS[1].seconds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDemo = CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000";

  function autofill() {
    setTitle(SAMPLE.title);
    setDescription(SAMPLE.description);
    setStakeGen(SAMPLE.stakeGen);
    setFilingSeconds(SAMPLE.filingSeconds);
    setChallengeSeconds(SAMPLE.challengeSeconds);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isConnected || !address) { setError("Connect your wallet first."); return; }
    if (isDemo) { setError("Set CONTRACT_ADDRESS in src/genlayer/config.ts before creating disputes."); return; }
    if (!title.trim() || !description.trim()) { setError("Title and description are required."); return; }

    setSubmitting(true);
    try {
      const contract = new VeritasContract(CONTRACT_ADDRESS, address);
      const receipt = await contract.createDispute(
        title.trim(),
        description.trim(),
        genToWei(stakeGen),
        filingSeconds,
        challengeSeconds
      );
      const disputeId = (receipt.payload)?.id;
      void navigate(typeof disputeId === "string" ? `/dispute/${disputeId}` : "/");
    } catch (err: unknown) {
      const e2 = err as { message?: string };
      setError(e2?.message || "Transaction failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 8px" }}>File a Priority Dispute</h1>
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>
            Open a filing window during which any number of claimants can each pin one artifact
            and stake the required amount. Timing and substantive match are decided by independent
            GenLayer validators — never by you or the platform.
          </p>
        </div>
        <button type="button" onClick={autofill} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
          Autofill Sample
        </button>
      </div>

      {/* Network warning */}
      {isConnected && !isOnCorrectNetwork && (
        <div className="alert alert-warn" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Info size={14} />
          Switch your wallet to GenLayer StudioNet before filing.
        </div>
      )}

      {/* Demo warning */}
      {isDemo && (
        <div className="alert alert-info" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Info size={14} />
          Demo mode — set CONTRACT_ADDRESS in <code className="mono" style={{ fontSize: 11 }}>src/genlayer/config.ts</code> to enable writes.
        </div>
      )}

      {/* Form */}
      <form onSubmit={(e) => void handleSubmit(e)} className="card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Idea / Work Title
          </label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            placeholder="A brief, precise title for the work or idea being disputed"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Description
          </label>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--fg-subtle)" }}>
            Be specific — this is the rubric validators use to judge substantive match.
          </p>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={4000}
            required
            placeholder="Describe the specific mechanism or idea being disputed. Vague descriptions weaken every claim's ability to clear the match threshold."
            style={{ resize: "vertical" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Required Stake per Claim (GEN)
            </label>
            <input
              className="input"
              type="number"
              min="0.000001"
              step="0.000001"
              value={stakeGen}
              onChange={(e) => setStakeGen(e.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Filing Window
            </label>
            <select
              className="input"
              value={filingSeconds}
              onChange={(e) => setFilingSeconds(Number(e.target.value))}
              style={{ appearance: "none" }}
            >
              {FILING_WINDOWS.map((o) => (
                <option key={o.seconds} value={o.seconds}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Challenge Window (after preliminary ranking)
          </label>
          <select
            className="input"
            value={challengeSeconds}
            onChange={(e) => setChallengeSeconds(Number(e.target.value))}
            style={{ appearance: "none" }}
          >
            {CHALLENGE_WINDOWS.map((o) => (
              <option key={o.seconds} value={o.seconds}>{o.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="alert alert-error">{error}</div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !isConnected}
          style={{ height: 44, fontSize: 12, marginTop: 4 }}
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Submitting Transaction…
            </>
          ) : (
            "Create Dispute"
          )}
        </button>

        {!isConnected && (
          <p style={{ margin: 0, textAlign: "center", fontSize: 12, color: "var(--fg-muted)" }}>
            Connect your wallet to continue.
          </p>
        )}
      </form>
    </div>
  );
}
