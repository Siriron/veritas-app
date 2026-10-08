# Veritas — Contract Reference

**Deployed address:** `0xd4972C7A49D5D3Ca3eB307DA7faA97294fA303ff`  
**Explorer:** https://explorer-studio.genlayer.com/address/0xd4972C7A49D5D3Ca3eB307DA7faA97294fA303ff  
**Source:** [`contracts/VeritasDisputes.py`](../contracts/VeritasDisputes.py)  
**GenLayer dependency:** `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`

---

## Constants

| Constant | Value | Description |
|---|---|---|
| `MIN_FILING_WINDOW_SECONDS` | 900 (15 min) | Minimum filing window |
| `MAX_FILING_WINDOW_SECONDS` | 2,592,000 (30 days) | Maximum filing window |
| `DEFAULT_FILING_WINDOW_SECONDS` | 172,800 (48 h) | Default filing window |
| `MIN_CHALLENGE_WINDOW_SECONDS` | 7,200 (2 h) | Minimum challenge window |
| `MAX_CHALLENGE_WINDOW_SECONDS` | 1,209,600 (14 days) | Maximum challenge window |
| `DEFAULT_CHALLENGE_WINDOW_SECONDS` | 86,400 (24 h) | Default challenge window |
| `EVALUATION_TIMEOUT_SECONDS` | 1,209,600 (14 days) | Evaluation must be triggered within this time after the filing deadline |
| `FINALIZE_TIMEOUT_SECONDS` | 1,209,600 (14 days) | A ranked dispute must be finalized within this time after the challenge window closes |
| `TIMESTAMP_TOLERANCE_SECONDS` | 86,400 (24 h) | Near-tie tolerance |
| `MATCH_THRESHOLD_BPS` | 6000 | Minimum match score to be eligible to win |
| `MATCH_SCORE_TOLERANCE_BPS` | 1500 | Validator match-score agreement tolerance |
| `MAX_CLAIMS_PER_DISPUTE` | 12 | Hard cap on claims per dispute |
| `MAX_CHALLENGE_EVIDENCE_PER_CLAIM` | 5 | Hard cap on challenge evidence URLs |

---

## Write Methods

### `create_dispute`
```python
def create_dispute(
    idea_title: str,                                        # 1–200 chars
    idea_description: str,                                  # 1–4000 chars
    required_stake_wei: int,                                # GEN wei, > 0
    filing_window_seconds: int = 172800,                    # 15m–30d
    challenge_window_seconds: int = 86400,                  # 2h–14d
) -> str                                                    # returns dispute_id
```
Opens a new dispute. The creator does not stake; each claimant stakes separately via `file_claim`.

---

### `file_claim` *(payable)*
```python
def file_claim(
    dispute_id: str,
    artifact_url: str,               # public http(s) URL, immutable after filing
    provenance_type: str,            # "WAYBACK" | "GIT_COMMIT" | "PLATFORM_PUBLISH"
    provenance_hint_url: str = "",   # required for GIT_COMMIT; optional for WAYBACK
) -> str                             # returns claim_id
```
`gl.message.value` must equal `dispute.required_stake_wei` exactly. One claim per address per dispute.

**provenance_hint_url rules:**
- `WAYBACK`: must be empty OR the archive.org Availability API queried for this exact artifact
- `GIT_COMMIT`: **required** — must be a `api.github.com/repos/{o}/{r}/commits/{sha}` URL for the same repo as `artifact_url`
- `PLATFORM_PUBLISH`: must be empty — the API URL is derived from `artifact_url` automatically

---

### `trigger_evaluation`
```python
def trigger_evaluation(dispute_id: str) -> None
```
Callable by anyone after the filing window closes and ≥2 claims exist. Transitions to `VALIDATING`, runs the nondeterministic validator evaluation, then transitions to `RANKED`.

---

### `submit_challenge_evidence`
```python
def submit_challenge_evidence(claim_id: str, evidence_url: str) -> None
```
The claimant may submit up to 5 additional provenance URLs for their own pinned artifact during the challenge window. Never replaces the artifact — only adds alternative third-party provenance sources.

---

### `finalize_dispute`
```python
def finalize_dispute(dispute_id: str) -> None
```
Callable by anyone after the challenge window closes. If challenge evidence was submitted, runs one final nondeterministic re-evaluation; otherwise uses the preliminary ranking directly. Sets per-claim `status` (`WINNER`/`LOSER`/`REFUNDED`) and transitions the dispute to `FINALIZED` or `INCONCLUSIVE`.

---

### `withdraw`
```python
def withdraw(claim_id: str) -> None
```
Pull-based payout:
- `WINNER` claim → receives the full `stake_pool_deposited`
- `REFUNDED` claim (INCONCLUSIVE) → receives their own `stake_deposited` back

---

### `cancel_dispute`
```python
def cancel_dispute(dispute_id: str) -> None
```
Creator-only. Only callable when `claim_count == 0` and status is `FILING_OPEN`.

---

### `claim_single_filer_refund`
```python
def claim_single_filer_refund(dispute_id: str) -> None
```
When only one claim was filed and the filing window has closed, the sole claimant may recover their stake. Transitions dispute to `TIMED_OUT`.

---

### `claim_dispute_timeout`
```python
def claim_dispute_timeout(dispute_id: str) -> None
```
Bounded exit before finalization. A claimant recovers their own stake if the dispute is `FILING_OPEN`/`VALIDATING` past `evaluation_timeout_ts`, or `RANKED` more than `FINALIZE_TIMEOUT_SECONDS` after the challenge window closed. `trigger_evaluation` and `finalize_dispute` refuse to run once their window has expired, so a refund can never race a payout.

---

## View Methods

### `get_dispute`
```python
def get_dispute(dispute_id: str) -> str  # JSON
```

### `get_claim`
```python
def get_claim(claim_id: str) -> str  # JSON
```

### `get_dispute_claims`
```python
def get_dispute_claims(dispute_id: str) -> str  # JSON array of claim_ids
```

### `get_contract_info`
```python
def get_contract_info() -> str  # JSON: {owner, total_disputes, total_claims}
```

### `get_current_time`
```python
def get_current_time() -> int  # current block timestamp (unix seconds)
```

---

## Error Codes

All user-facing errors are prefixed with a classification tag:

| Prefix | Meaning |
|---|---|
| `[EXPECTED]` | Deterministic business-logic rejection — caller passed bad input |
| `[EXTERNAL]` | Provenance source returned a 4xx or unexpected shape |
| `[TRANSIENT]` | Network/5xx flakiness during evaluation |
| `[LLM_ERROR]` | Model produced unusable output — forces validator rotation |
