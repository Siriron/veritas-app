// ────────────────────────────────────────────────────────────────────────────
// VERITAS – GenLayer priority-dispute resolution
// Contract types
// ────────────────────────────────────────────────────────────────────────────

export type DisputeStatus =
  | "FILING_OPEN"
  | "VALIDATING"
  | "RANKED"
  | "FINALIZED"
  | "INCONCLUSIVE"
  | "CANCELLED"
  | "TIMED_OUT";

export type ClaimStatus = "FILED" | "EVALUATED" | "WINNER" | "LOSER" | "REFUNDED";

export type ProvenanceType = "WAYBACK" | "GIT_COMMIT" | "PLATFORM_PUBLISH";

export interface Dispute {
  dispute_id: string;
  creator: string;
  idea_title: string;
  idea_description: string;
  status: DisputeStatus;
  required_stake_wei: bigint;
  stake_pool_deposited: bigint;
  claim_count: number;
  created_ts: number;
  filing_deadline_ts: number;
  evaluation_timeout_ts: number;
  leading_claim_id: string;
  ranking_verdict: string;
  ranking_rationale: string;
  ranked_ts: number;
  challenge_deadline_ts: number;
  had_challenge_evidence: boolean;
  final_winner_claim_id: string;
  finalized_ts: number;
}

export interface Claim {
  claim_id: string;
  dispute_id: string;
  claimant: string;
  artifact_url: string;
  provenance_type: ProvenanceType;
  provenance_hint_url: string;
  stake_wei: bigint;
  stake_deposited: bigint;
  status: ClaimStatus;
  estimated_earliest_ts: number;
  timestamp_verified: boolean;
  match_score_bps: number;
  evaluation_notes: string;
  challenge_evidence: string[];
  filed_ts: number;
  evaluated_ts: number;
}

export interface TxReceipt {
  hash: string;
  payload: Record<string, unknown>;
  [key: string]: unknown;
}
