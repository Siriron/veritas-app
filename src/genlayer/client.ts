// ────────────────────────────────────────────────────────────────────────────
// VERITAS – GenLayer contract client
// All contract reads and writes go through this class.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus, type CalldataEncodable, type Hash } from "genlayer-js/types";
import type { Dispute, Claim, TxReceipt } from "./types";
import { STUDIONET_RPC, EXPLORER_TX_URL } from "./config";
import { estimateWriteFeePreset, feePresetToTransactionFees } from "./fees";

// ── Receipt validation ──────────────────────────────────────────────────────

const FAILED_TX = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);
const COMMITTED_TX = new Set(["ACCEPTED", "FINALIZED", "READY_TO_FINALIZE"]);
const FAILED_RESULT = new Set([
  "MAJORITY_DISAGREE", "NO_MAJORITY", "DETERMINISTIC_VIOLATION",
  "DISAGREE", "TIMEOUT", "FAILURE",
]);

export class TimeoutError extends Error {
  txHash: string;
  isTimeout = true as const;
  constructor(hash: string) {
    super(
      `Consensus is taking longer than expected. Your transaction was submitted — ` +
      `check its status at ${EXPLORER_TX_URL(hash)}`
    );
    this.txHash = hash;
  }
}

// ── Value coercions ─────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "string") { try { return asRecord(JSON.parse(v)); } catch { return {}; } }
  if (typeof v === "object") return v as Record<string, unknown>;
  return {};
}

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  const r = v as Record<string, unknown>;
  if (typeof r?.as_hex === "string") return r.as_hex;
  return JSON.stringify(v);
}

function asBigInt(v: unknown): bigint {
  const t = asText(v || "0") || "0";
  try { return BigInt(t); } catch { return 0n; }
}

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return asText(v).toLowerCase() === "true";
}

function asDispute(raw: unknown): Dispute {
  const r = asRecord(raw);
  return {
    dispute_id: asText(r.dispute_id),
    creator: asText(r.creator),
    idea_title: asText(r.idea_title),
    idea_description: asText(r.idea_description),
    status: asText(r.status) as Dispute["status"],
    required_stake_wei: asBigInt(r.required_stake_wei),
    stake_pool_deposited: asBigInt(r.stake_pool_deposited),
    claim_count: Number(r.claim_count || 0),
    created_ts: Number(r.created_ts || 0),
    filing_deadline_ts: Number(r.filing_deadline_ts || 0),
    evaluation_timeout_ts: Number(r.evaluation_timeout_ts || 0),
    leading_claim_id: asText(r.leading_claim_id),
    ranking_verdict: asText(r.ranking_verdict),
    ranking_rationale: asText(r.ranking_rationale),
    ranked_ts: Number(r.ranked_ts || 0),
    challenge_deadline_ts: Number(r.challenge_deadline_ts || 0),
    had_challenge_evidence: asBool(r.had_challenge_evidence),
    final_winner_claim_id: asText(r.final_winner_claim_id),
    finalized_ts: Number(r.finalized_ts || 0),
  };
}

function asClaim(raw: unknown): Claim {
  const r = asRecord(raw);
  const ev = r.challenge_evidence;
  return {
    claim_id: asText(r.claim_id),
    dispute_id: asText(r.dispute_id),
    claimant: asText(r.claimant),
    artifact_url: asText(r.artifact_url),
    provenance_type: asText(r.provenance_type) as Claim["provenance_type"],
    provenance_hint_url: asText(r.provenance_hint_url),
    stake_wei: asBigInt(r.stake_wei),
    stake_deposited: asBigInt(r.stake_deposited),
    status: asText(r.status) as Claim["status"],
    estimated_earliest_ts: Number(r.estimated_earliest_ts || 0),
    timestamp_verified: asBool(r.timestamp_verified),
    match_score_bps: Number(r.match_score_bps || 0),
    evaluation_notes: asText(r.evaluation_notes),
    challenge_evidence: Array.isArray(ev) ? (ev as string[]) : [],
    filed_ts: Number(r.filed_ts || 0),
    evaluated_ts: Number(r.evaluated_ts || 0),
  };
}

function readableError(text: string): string {
  const c = text.replace(/\s+/g, " ").trim();
  const m = c.match(/(?:UserError|Exception|Error):\s*(.+)$/i);
  return m?.[1]?.trim() || c;
}

function leaderErrorDetail(receipt: unknown, fallback: string): string {
  const rec = receipt as Record<string, unknown>;
  const cd = rec?.consensus_data as Record<string, unknown> | undefined;
  const leader = cd?.leader_receipt;
  const r: unknown = Array.isArray(leader) ? leader[0] : leader;
  const rRec = r as Record<string, unknown> | undefined;
  const resultRec = rRec?.result as Record<string, unknown> | undefined;
  const payload: unknown = resultRec?.payload ?? resultRec;
  if (typeof payload === "string" && payload.trim()) return readableError(payload);
  if (payload && typeof payload === "object") {
    const payRec = payload as Record<string, unknown>;
    const readable = payRec.readable ?? payRec.payload;
    if (typeof readable === "string" && readable.trim()) return readableError(readable);
  }
  return fallback;
}

function assertSuccessfulReceipt(receipt: unknown): void {
  const rec = receipt as Record<string, unknown>;
  function toStr(v: unknown): string {
    return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  }
  const status = toStr(rec?.statusName ?? rec?.status_name ?? rec?.status).toUpperCase();
  if (!status || FAILED_TX.has(status))
    throw new Error(`Network did not reach consensus (${status || "UNKNOWN"}). Please try again.`);
  if (!COMMITTED_TX.has(status))
    throw new Error(`Transaction not committed yet (${status}). Please try again.`);
  const resultName = toStr(rec?.resultName ?? rec?.result_name).toUpperCase();
  if (resultName && FAILED_RESULT.has(resultName))
    throw new Error(`Validators disagreed (${resultName}). Please try again.`);
  const execution = toStr(rec?.txExecutionResultName ?? rec?.tx_execution_result_name ?? rec?.txExecutionResult).toUpperCase();
  const finishedReturn = String(ExecutionResult.FINISHED_WITH_RETURN);
  if (execution && execution !== finishedReturn)
    throw new Error(`Contract execution failed: ${leaderErrorDetail(receipt, execution)}`);
}

// ── GEN unit helpers ────────────────────────────────────────────────────────

export function genToWei(gen: string | number): bigint {
  const [whole, frac = ""] = String(gen).split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0");
}

// ── Client factory ──────────────────────────────────────────────────────────

function getEthereum(): unknown {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as Record<string, unknown>).ethereum;
}

function buildClient(address?: string | null) {
  const chain = { ...studionet, rpcUrls: { default: { http: [STUDIONET_RPC] } } };
  const config: Record<string, unknown> = { chain, endpoint: STUDIONET_RPC };
  if (address) config.account = address;
  const eth = getEthereum();
  if (eth) config.provider = eth;
  return createClient(config);
}

// ── Main contract class ─────────────────────────────────────────────────────

export class VeritasContract {
  private contractAddress: `0x${string}`;
  private client: ReturnType<typeof createClient>;

  constructor(contractAddress: string, address?: string | null) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.client = buildClient(address);
  }

  updateAccount(address: string): void {
    this.client = buildClient(address);
  }

  private async read(functionName: string, args: CalldataEncodable[] = []) {
    return this.client.readContract({ address: this.contractAddress, functionName, args });
  }

  private async write(
    functionName: string,
    args: CalldataEncodable[],
    value: bigint,
    retries = 80,
    interval = 5000
  ): Promise<TxReceipt> {
    // Ensure chain before every write
    await ensureChain();

    const feePreset = await estimateWriteFeePreset(
      this.client,
      { address: this.contractAddress, functionName, args, value },
      "standard"
    );
    const fees = feePresetToTransactionFees(feePreset);

    const clientAny = this.client as unknown as Record<string, unknown>;

    // Defensive connect attempt (confirmed pattern from reference)
    if (typeof clientAny.connect === "function") {
      try {
        await (clientAny.connect as (s: string) => Promise<void>)("studionet");
      } catch {
        // non-fatal
      }
    }

    const txHashRaw: unknown = await (clientAny.writeContract as (r: unknown) => Promise<unknown>)({
      address: this.contractAddress,
      functionName,
      args,
      value,
      ...(fees ? { fees } : {}),
    });
    const txHash = txHashRaw as Hash;

    let receipt: unknown;
    try {
      receipt = await this.client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries,
        interval,
      });
    } catch {
      throw new TimeoutError(String(txHash));
    }

    assertSuccessfulReceipt(receipt);
    const rec = receipt as Record<string, unknown>;
    return {
      ...(receipt as TxReceipt),
      hash: (rec?.hash as string) || String(txHash),
      payload: asRecord(receipt),
    };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  async getDispute(disputeId: string): Promise<Dispute> {
    return asDispute(await this.read("get_dispute", [disputeId]));
  }

  async getClaim(claimId: string): Promise<Claim> {
    return asClaim(await this.read("get_claim", [claimId]));
  }

  async getDisputeClaimIds(disputeId: string): Promise<string[]> {
    const raw = await this.read("get_dispute_claims", [disputeId]);
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  }

  async getContractInfo(): Promise<Record<string, unknown>> {
    return asRecord(await this.read("get_contract_info"));
  }

  /** Returns the total number of disputes created so far. */
  async getDisputeCount(): Promise<number> {
    const info = await this.getContractInfo();
    const seq = info.next_dispute_seq ?? info.dispute_count ?? info.total_disputes;
    if (seq !== undefined) return Number(seq);
    // Fallback: probe sequentially until a dispute is not found
    let count = 0;
    for (let i = 0; i < 50; i++) {
      try {
        const d = asDispute(await this.read("get_dispute", [`dispute:${i}`]));
        if (!d.dispute_id) break;
        count = i + 1;
      } catch {
        break;
      }
    }
    return count;
  }

  /** Fetches all disputes in reverse-creation order (newest first). */
  async getAllDisputes(): Promise<Dispute[]> {
    const count = await this.getDisputeCount();
    const results: Dispute[] = [];
    for (let i = count - 1; i >= 0; i--) {
      try {
        const d = await this.getDispute(`dispute:${i}`);
        if (d.dispute_id) results.push(d);
      } catch {
        // skip missing entries
      }
    }
    return results;
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  createDispute(
    ideaTitle: string,
    ideaDescription: string,
    requiredStakeWei: bigint,
    filingWindowSeconds: number,
    challengeWindowSeconds: number
  ) {
    return this.write(
      "create_dispute",
      [ideaTitle, ideaDescription, Number(requiredStakeWei), filingWindowSeconds, challengeWindowSeconds],
      0n
    );
  }

  cancelDispute(disputeId: string) {
    return this.write("cancel_dispute", [disputeId], 0n);
  }

  fileClaim(
    disputeId: string,
    artifactUrl: string,
    provenanceType: string,
    provenanceHintUrl: string,
    stakeWei: bigint
  ) {
    return this.write("file_claim", [disputeId, artifactUrl, provenanceType, provenanceHintUrl], stakeWei);
  }

  triggerEvaluation(disputeId: string) {
    return this.write("trigger_evaluation", [disputeId], 0n, 240, 8000);
  }

  submitChallengeEvidence(claimId: string, evidenceUrl: string) {
    return this.write("submit_challenge_evidence", [claimId, evidenceUrl], 0n);
  }

  finalizeDispute(disputeId: string) {
    return this.write("finalize_dispute", [disputeId], 0n, 240, 8000);
  }

  withdraw(claimId: string) {
    return this.write("withdraw", [claimId], 0n);
  }

  claimSingleFilerRefund(disputeId: string) {
    return this.write("claim_single_filer_refund", [disputeId], 0n);
  }

  claimDisputeTimeout(disputeId: string) {
    return this.write("claim_dispute_timeout", [disputeId], 0n);
  }
}

// ── ensureChain ──────────────────────────────────────────────────────────────

export async function ensureChain(): Promise<void> {
  const eth = getEthereum() as { request: (r: unknown) => Promise<unknown> } | undefined;
  if (!eth) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xF22F" }] });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e?.code === 4902) {
      const config = {
        chainId: "0xF22F",
        chainName: "GenLayer StudioNet",
        rpcUrls: [STUDIONET_RPC],
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
      };
      await eth.request({ method: "wallet_addEthereumChain", params: [config] });
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xF22F" }] });
    } else if (e?.code === -32002) {
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      throw err;
    }
  }
}
