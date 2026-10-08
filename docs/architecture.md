# Veritas — Architecture

## Overview

Veritas is a full-stack GenLayer dapp consisting of:

1. **`VeritasDisputes.py`** — an Intelligent Contract deployed on GenLayer StudioNet that stores dispute and claim records, runs nondeterministic validator evaluation, and manages pull-based GEN payouts.
2. **React + Vite SPA** — a browser frontend that communicates directly with the contract via `genlayer-js` over RPC. No backend, no indexer.

---

## Dispute State Machine

```
                      ┌──────────────────┐
                      │   (not exists)   │
                      └────────┬─────────┘
                               │ create_dispute()
                               ▼
                      ┌──────────────────┐
                      │  FILING_OPEN     │◄─── file_claim() [payable]
                      └────────┬─────────┘
              ┌────────────────┼────────────────────┐
              │                │                    │
              │ cancel()       │ trigger_evaluation  │ filing window closed,
              │ (0 claims)     │ (≥2 claims, after   │ 1 claim only →
              ▼                │  filing deadline)   │ claim_single_filer_refund()
     ┌──────────────┐          ▼                    ▼
     │  CANCELLED   │  ┌──────────────────┐  ┌──────────────┐
     └──────────────┘  │   VALIDATING     │  │  TIMED_OUT   │
                       │ (nondet running) │  └──────────────┘
                       └────────┬─────────┘
                                │ consensus reached
                                ▼
                       ┌──────────────────┐
                       │     RANKED       │◄── submit_challenge_evidence()
                       │ (challenge window)│
                       └────────┬─────────┘
                                │ finalize_dispute()
                                │ (after challenge deadline)
                    ┌───────────┴────────────┐
                    │                        │
                    ▼                        ▼
           ┌──────────────────┐    ┌──────────────────┐
           │    FINALIZED     │    │   INCONCLUSIVE   │
           │  winner.withdraw │    │ each claimant    │
           │  (full pool)     │    │ withdraw own     │
           └──────────────────┘    │ stake back       │
                                   └──────────────────┘
```

If evaluation is never triggered within `EVALUATION_TIMEOUT_SECONDS` (14 days after filing closes), any claimant may call `claim_dispute_timeout()` to recover their stake. The same exit applies to a ranked dispute that is not finalized within `FINALIZE_TIMEOUT_SECONDS` of the challenge window closing.

---

## Claim State Machine

```
file_claim()
     │
     ▼
  FILED
     │ trigger_evaluation() / finalize_dispute() completes
     ▼
EVALUATED
     │
     ├── verdict = RANKED_WINNER AND this is the winner ──► WINNER  → withdraw() (full pool)
     ├── verdict = RANKED_WINNER AND this is a loser   ──► LOSER   → no payout
     └── verdict = INCONCLUSIVE                        ──► REFUNDED → withdraw() (own stake)
```

---

## Nondeterministic Evaluation

The evaluation step (`trigger_evaluation` / `finalize_dispute`) uses `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`:

- **`leader_fn`**: fetches every claim's artifact + provenance source, scores substantive match with an LLM, returns a structured `{results: {claim_id: {timestamp_unix, match_score_bps, ...}}}` dict.
- **`validator_fn`**: independently re-runs the exact same fetch+score pipeline and checks agreement within tolerance thresholds.
- **Ranking (`_rank_claims`)**: a fully deterministic function over the agreed structured results — never inside the nondet boundary.

Tolerances:
- Match score: ±1500 bps (validators may disagree on exact LLM output but must agree on the threshold side)
- Timestamp: ±6 hours (deterministic API parsing; tolerance covers incidental cross-node clock skew only)

---

## Storage Layout

### `DisputeRecord`
| Field | Type | Description |
|---|---|---|
| `dispute_id` | `str` | `"dispute:{seq}"` |
| `creator` | `Address` | Dispute opener |
| `idea_title` | `str` | 1–200 chars |
| `idea_description` | `str` | 1–4000 chars |
| `status` | `str` | State machine status |
| `required_stake_wei` | `u256` | GEN wei each claimant must stake |
| `stake_pool_deposited` | `u256` | Running sum of all deposited stakes |
| `claim_count` | `u256` | Number of claims filed |
| `filing_deadline_ts` | `u256` | Unix timestamp; `_now_ts()` at create + window |
| `evaluation_timeout_ts` | `u256` | 14 days after filing deadline |
| `challenge_deadline_ts` | `u256` | Duration (seconds) until ranking; absolute thereafter |
| `ranking_verdict` | `str` | `RANKED_WINNER` or `INCONCLUSIVE` |
| `leading_claim_id` | `str` | Winning claim ID (empty if INCONCLUSIVE) |
| `had_challenge_evidence` | `bool` | Whether any challenge evidence was submitted |
| `final_winner_claim_id` | `str` | Set at finalization |
| `finalized_ts` | `u256` | Unix timestamp of finalization |

### `ClaimRecord`
| Field | Type | Description |
|---|---|---|
| `claim_id` | `str` | `"claim:{seq}"` |
| `dispute_id` | `str` | Parent dispute |
| `claimant` | `Address` | Filer's wallet address |
| `artifact_url` | `str` | Immutable public artifact URL |
| `provenance_type` | `str` | `WAYBACK` / `GIT_COMMIT` / `PLATFORM_PUBLISH` |
| `provenance_hint_url` | `str` | Optional third-party provenance endpoint |
| `stake_wei` | `u256` | Required stake amount |
| `stake_deposited` | `u256` | Actual deposited amount (zeroed on withdrawal) |
| `status` | `str` | `FILED` → `EVALUATED` → `WINNER`/`LOSER`/`REFUNDED` |
| `estimated_earliest_ts` | `u256` | Unix timestamp from provenance source |
| `timestamp_verified` | `bool` | Whether provenance fetch succeeded |
| `match_score_bps` | `u256` | Substantive match score (0–10000) |
| `evaluation_notes` | `str` | LLM justification |
| `challenge_evidence_json` | `str` | JSON array of extra provenance URLs |
| `filed_ts` | `u256` | When this claim was filed |
| `evaluated_ts` | `u256` | When evaluation completed |

---

## Security Properties

| Property | How enforced |
|---|---|
| No self-reported timestamps | Timestamps extracted only from independently-fetched third-party APIs |
| Adversarial artifact content ignored | Timestamp extraction never reads artifact page text; match-score prompt instructs model to ignore date/priority claims |
| One claim per address | `dispute_claimant_index` TreeMap key `"{dispute_id}:{addr_hex}"` |
| Artifact URL immutable after filing | `artifact_url` field never written after `file_claim()` |
| Challenge evidence additive only | `submit_challenge_evidence()` appends to `challenge_evidence_json`; never replaces `artifact_url` |
| Funds never locked forever | Single-filer refund + evaluation timeout + INCONCLUSIVE pooled refund |
| Pull-based settlement | `_send_gen()` only called from `withdraw()`, `claim_single_filer_refund()`, `claim_dispute_timeout()` |
| Single GEN emission point | All fund movements go through `_send_gen()` — one function to audit |
