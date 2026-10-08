<div align="center">

<img src="./public/favicon.svg" width="88" alt="Veritas logo" />

# Veritas

### Priority-Dispute Resolution Protocol on GenLayer

**"Who built it first? Let independent evidence decide."**

[![GenLayer](https://img.shields.io/badge/GenLayer-StudioNet-7c3aed?style=flat-square)](https://studio.genlayer.com)
[![Contract](https://img.shields.io/badge/Contract-Deployed-22c55e?style=flat-square)](https://explorer-studio.genlayer.com/address/0x27b38C74B2066D731Ca98169424730B93F23047C)
[![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb?style=flat-square)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-white?style=flat-square)](LICENSE)

</div>

---

## What is Veritas?

Veritas is an onchain priority-dispute resolution protocol built on **GenLayer** — a blockchain that runs Intelligent Contracts (Python + LLM). Two or more parties stake GEN claiming they were first to create a specific idea, design, or piece of work. GenLayer validators **independently fetch** each claimant's pinned artifact and a third-party provenance source, derive a verified timestamp and a substantive-match score per claim, and a fully deterministic ranking function picks the winner.

No self-reported dates. No "first to file" wins. No arbiter. The public timeline decides.

---

## Deployed Contract

| | |
|---|---|
| **Network** | GenLayer StudioNet (Chain ID `61999`) |
| **Contract Address** | [`0x27b38C74B2066D731Ca98169424730B93F23047C`](https://explorer-studio.genlayer.com/address/0x27b38C74B2066D731Ca98169424730B93F23047C) |
| **Explorer** | [explorer-studio.genlayer.com/address/0x27b38C74B2066D731Ca98169424730B93F23047C](https://explorer-studio.genlayer.com/address/0x27b38C74B2066D731Ca98169424730B93F23047C) |
| **RPC** | `https://studio.genlayer.com/api` |
| **Source** | [`contracts/VeritasDisputes.py`](contracts/VeritasDisputes.py) |

---

## How It Works

```
Creator opens dispute
        │
        ▼
  ┌─────────────────────────────┐
  │   FILING_OPEN               │  ← Claimants stake GEN + pin artifact URL
  │   (filing window: 15m–30d)  │    + provenance source type
  └─────────────────────────────┘
        │  window closes + ≥2 claims
        ▼
  ┌─────────────────────────────┐
  │   VALIDATING                │  ← GenLayer validators independently fetch
  │   (nondet evaluation)       │    every artifact + provenance source,
  └─────────────────────────────┘    derive timestamp + match score per claim
        │
        ▼
  ┌─────────────────────────────┐
  │   RANKED                    │  ← Deterministic ranking posted
  │   (challenge window: 2h–14d)│    Claimants may add additive provenance
  └─────────────────────────────┘
        │  window closes
        ▼
  ┌─────────────────────────────┐
  │   FINALIZED / INCONCLUSIVE  │  ← Winner withdraws full pool
  │                             │    INCONCLUSIVE = pooled refund
  └─────────────────────────────┘
```

### Provenance Source Types

| Type | What validators fetch | Trust anchor |
|---|---|---|
| `WAYBACK` | Internet Archive Availability API | `archive.org` — immutable historical record |
| `GIT_COMMIT` | GitHub/GitLab Commit API | Committer timestamp from hosting platform |
| `PLATFORM_PUBLISH` | Hacker News Firebase API | Platform's own server-assigned `time` field |

### Trust Boundaries

- **No self-reported dates.** Timestamps come only from independently-fetched, third-party-verifiable sources — never from text the claimant wrote.
- **Adversarial content resistance.** Artifact pages are claimant-controlled and may contain fake dates or embedded LLM instructions. Timestamp extraction never reads the artifact's own page text.
- **Deterministic ranking.** The nondeterministic step (LLM + web fetches) may only output a structured `(timestamp, match_score)` result per claim. Ranking and payout are computed by a fully separate, deterministic function — validators never move funds directly.
- **Near-tie = INCONCLUSIVE.** Timestamps within 24 hours of each other cannot be reliably distinguished; the protocol refunds everyone rather than guess.
- **Pull-based settlement.** Funds are never pushed — each party calls `withdraw()` to claim their payout after finalization.
- **Bounded exit.** Every fund path has a timeout or refund path — no funds can be locked forever.

---

## Project Structure

```
contracts/VeritasDisputes.py        Intelligent Contract (GenLayer Python)
tests/                              Direct-mode tests that execute the real contract
src/genlayer/                       client, config, fees, types, wallet hook
src/components/                     Navbar, StatusBadge, WalletButton
src/pages/                          Home, CreateDispute, DisputeDetail, Profile
src/utils/format.ts                 address, GEN, timestamp, countdown formatters
docs/                               architecture.md, contract.md, frontend.md
public/favicon.svg                  logo
LICENSE                             MIT
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [MetaMask](https://metamask.io) browser extension
- GenLayer StudioNet added to MetaMask (see below)

### Add GenLayer StudioNet to MetaMask

| Field | Value |
|---|---|
| Network Name | GenLayer StudioNet |
| RPC URL | `https://studio.genlayer.com/api` |
| Chain ID | `61999` |
| Currency Symbol | `GEN` |
| Block Explorer | `https://explorer-studio.genlayer.com` |

Get free testnet GEN from [studio.genlayer.com](https://studio.genlayer.com) → Faucet.

### Run Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:5173
```

### Build for Production

```bash
npm run build
```

---

## Contract API

All public methods on `VeritasDisputes`:

### Writes

| Method | Args | Value | Description |
|---|---|---|---|
| `create_dispute` | `idea_title, idea_description, required_stake_wei, filing_window_seconds?, challenge_window_seconds?` | 0 | Open a new dispute |
| `file_claim` | `dispute_id, artifact_url, provenance_type, provenance_hint_url?` | `required_stake_wei` | Pin a claim with stake |
| `submit_challenge_evidence` | `claim_id, evidence_url` | 0 | Add provenance evidence during challenge window |
| `trigger_evaluation` | `dispute_id` | 0 | Start validator evaluation (after filing closes, ≥2 claims) |
| `finalize_dispute` | `dispute_id` | 0 | Finalise after challenge window closes |
| `withdraw` | `claim_id` | 0 | Winner or INCONCLUSIVE claimant pulls payout |
| `claim_single_filer_refund` | `dispute_id` | 0 | Refund if only one claim was filed |
| `cancel_dispute` | `dispute_id` | 0 | Creator cancels before any claim is filed |
| `claim_dispute_timeout` | `dispute_id` | 0 | Refund after the evaluation timeout, or after the finalization timeout on a ranked dispute |

### Views

| Method | Returns | Description |
|---|---|---|
| `get_dispute` | JSON string | Full dispute record |
| `get_claim` | JSON string | Full claim record |
| `get_dispute_claims` | JSON array string | All claim IDs for a dispute |
| `get_contract_info` | JSON string | Owner, total disputes/claims |
| `get_current_time` | int | Current block timestamp |

---

## Testing status

```bash
pip install "genlayer-test==0.29.2" genvm-linter
pytest tests -q -p no:cacheprovider      # 58 tests
genvm-lint check contracts/VeritasDisputes.py
```

`tests/test_direct.py` loads `contracts/VeritasDisputes.py` under the real GenVM SDK in direct mode and runs its real `leader_fn` / `validator_fn`. Only the outside world is mocked (web, LLM); `emit_transfer` calls are captured so exact recipients and amounts are asserted. Covered: every state guard and input check, the full file → trigger → challenge → finalize → withdraw lifecycle, the earliest-timestamp winner, near-tie and below-threshold INCONCLUSIVE refunds, a sole eligible claim, the second independent evaluation round that can overturn the first ranking, HTTP 403/404/500 never becoming evidence, digest and repository binding, Hacker News id echo, model-score parsing and clamping, all three timeout exits, and the validator's agreement rules (score side and tolerance, timestamp tolerance, digest, matching external failures, errored or junk leader results, the challenge round). Storage pickling is checked on the main lifecycle.

The SDK bundle is pinned (`GENVM_SDK_VERSION`, default `v0.2.16`). Unpinned, the harness asks GitHub for the latest release, which can be a release candidate with no downloadable bundle.

Not proven by these tests: real LLM behaviour, real network behaviour, real multi-node consensus timing.

---

## Docs

- [Architecture](docs/architecture.md) — state machine, trust model, storage layout
- [Contract reference](docs/contract.md) — all methods, parameters, error codes
- [Frontend guide](docs/frontend.md) — component tree, wallet hook, RPC patterns

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
Built on <a href="https://genlayer.com">GenLayer</a>
</div>
