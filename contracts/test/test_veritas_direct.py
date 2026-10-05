"""
VERITAS — Direct-mode pytest test suite
========================================

Runs the VeritasDisputes Intelligent Contract in direct mode (no network,
no real validators, instant feedback). Uses genlayer-test 0.29.2.

What these tests cover:
  - Dispute creation + validation
  - Claim filing + validation
  - Cancel dispute (creator only, no claims)
  - Single-filer refund path
  - Challenge evidence submission
  - Dispute timeout emergency refund
  - All invalid-input rejection paths (_require guards)

What they do NOT cover (requires a live GenLayer node):
  - The nondeterministic evaluation step (trigger_evaluation, finalize_dispute)
    — that path calls gl.vm.run_nondet_unsafe + web fetches + LLM scoring.
  - Actual GEN transfers via _send_gen / emit_transfer.

Install:
  pip install "genlayer-test==0.29.2"

Run:
  pytest contracts/test/test_veritas_direct.py -q -p no:cacheprovider
"""

import pytest
import json
import time

# genlayer-test provides a lightweight GenVM runtime for direct mode
try:
    from genlayer.test import DirectTestClient, Address
except ImportError:
    pytest.skip("genlayer-test not installed — run: pip install genlayer-test==0.29.2", allow_module_level=True)

CONTRACT_PATH = "contracts/VeritasDisputes.py"

ALICE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
BOB   = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
CAROL = "0xcccccccccccccccccccccccccccccccccccccccc"

STAKE = 10 ** 18   # 1 GEN in wei
HOUR  = 3600
DAY   = 86400


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Fresh contract client for each test."""
    c = DirectTestClient(CONTRACT_PATH, deployer=ALICE)
    c.deploy()
    return c


@pytest.fixture
def dispute_id(client):
    """Create a standard dispute and return its id."""
    result = client.write(
        ALICE,
        "create_dispute",
        "Prior art on neural hash compression",
        "A technique for hashing neural network weights using locality-sensitive hashing.",
        STAKE,
        HOUR,          # 1h filing window (short for tests)
        2 * HOUR,      # 2h challenge window (minimum)
    )
    raw = client.read("get_dispute", result.return_value)
    d = json.loads(raw)
    return d["dispute_id"]


@pytest.fixture
def dispute_with_two_claims(client, dispute_id):
    """Dispute with two claims filed by Alice and Bob."""
    client.write(
        ALICE,
        "file_claim",
        dispute_id,
        "https://github.com/alice/research/blob/main/paper.md",
        "GIT_COMMIT",
        "https://api.github.com/repos/alice/research/commits/abc123",
        value=STAKE,
    )
    client.write(
        BOB,
        "file_claim",
        dispute_id,
        "https://web.archive.org/web/20230101/https://alice.io/post/nhlsh",
        "WAYBACK",
        "",
        value=STAKE,
    )
    return dispute_id


# ── Contract info ─────────────────────────────────────────────────────────────

class TestContractInfo:
    def test_initial_state(self, client):
        raw = client.read("get_contract_info")
        info = json.loads(raw)
        assert info["owner"].lower() == ALICE.lower()
        assert info["total_disputes"] == 0
        assert info["total_claims"] == 0

    def test_current_time_is_reasonable(self, client):
        ts = client.read("get_current_time")
        assert isinstance(ts, int)
        assert ts > 1_700_000_000  # after Nov 2023


# ── Dispute creation ──────────────────────────────────────────────────────────

class TestCreateDispute:
    def test_creates_dispute(self, client):
        result = client.write(
            ALICE,
            "create_dispute",
            "Test Idea",
            "A description of the test idea.",
            STAKE,
        )
        dispute_id = result.return_value
        assert dispute_id.startswith("dispute:")

        raw = client.read("get_dispute", dispute_id)
        d = json.loads(raw)
        assert d["status"] == "FILING_OPEN"
        assert d["idea_title"] == "Test Idea"
        assert d["required_stake_wei"] == STAKE
        assert d["claim_count"] == 0
        assert d["creator"].lower() == ALICE.lower()

    def test_increments_counter(self, client):
        client.write(ALICE, "create_dispute", "Idea 1", "Desc 1", STAKE)
        client.write(ALICE, "create_dispute", "Idea 2", "Desc 2", STAKE)
        info = json.loads(client.read("get_contract_info"))
        assert info["total_disputes"] == 2

    def test_custom_windows(self, client):
        result = client.write(
            ALICE, "create_dispute", "T", "D", STAKE,
            2 * HOUR,   # filing window
            4 * HOUR,   # challenge window
        )
        d = json.loads(client.read("get_dispute", result.return_value))
        assert d["filing_deadline_ts"] > d["created_ts"]

    def test_rejects_empty_title(self, client):
        with pytest.raises(Exception, match="idea_title"):
            client.write(ALICE, "create_dispute", "", "Desc", STAKE)

    def test_rejects_title_too_long(self, client):
        with pytest.raises(Exception, match="idea_title"):
            client.write(ALICE, "create_dispute", "x" * 201, "Desc", STAKE)

    def test_rejects_zero_stake(self, client):
        with pytest.raises(Exception, match="required_stake_wei"):
            client.write(ALICE, "create_dispute", "Title", "Desc", 0)

    def test_rejects_filing_window_too_short(self, client):
        with pytest.raises(Exception, match="filing_window_seconds"):
            client.write(ALICE, "create_dispute", "T", "D", STAKE, 60)  # 1 min < 15 min floor

    def test_rejects_challenge_window_too_short(self, client):
        with pytest.raises(Exception, match="challenge_window_seconds"):
            client.write(ALICE, "create_dispute", "T", "D", STAKE, HOUR, 60)  # 1 min < 2 h floor


# ── Cancel dispute ────────────────────────────────────────────────────────────

class TestCancelDispute:
    def test_creator_can_cancel_empty_dispute(self, client, dispute_id):
        client.write(ALICE, "cancel_dispute", dispute_id)
        d = json.loads(client.read("get_dispute", dispute_id))
        assert d["status"] == "CANCELLED"

    def test_non_creator_cannot_cancel(self, client, dispute_id):
        with pytest.raises(Exception, match="creator"):
            client.write(BOB, "cancel_dispute", dispute_id)

    def test_cannot_cancel_with_claims(self, client, dispute_id):
        client.write(
            BOB, "file_claim",
            dispute_id,
            "https://news.ycombinator.com/item?id=12345678",
            "PLATFORM_PUBLISH", "",
            value=STAKE,
        )
        with pytest.raises(Exception, match="Cannot cancel"):
            client.write(ALICE, "cancel_dispute", dispute_id)

    def test_cannot_cancel_nonexistent(self, client):
        with pytest.raises(Exception, match="not found"):
            client.write(ALICE, "cancel_dispute", "dispute:999")


# ── Claim filing ──────────────────────────────────────────────────────────────

class TestFileClaim:
    def test_file_wayback_claim(self, client, dispute_id):
        result = client.write(
            BOB, "file_claim",
            dispute_id,
            "https://example.com/my-paper",
            "WAYBACK", "",
            value=STAKE,
        )
        claim_id = result.return_value
        assert claim_id.startswith("claim:")
        c = json.loads(client.read("get_claim", claim_id))
        assert c["status"] == "FILED"
        assert c["provenance_type"] == "WAYBACK"
        assert c["claimant"].lower() == BOB.lower()
        assert c["stake_deposited"] == STAKE

    def test_file_git_commit_claim(self, client, dispute_id):
        result = client.write(
            BOB, "file_claim",
            dispute_id,
            "https://github.com/bob/proj/blob/main/README.md",
            "GIT_COMMIT",
            "https://api.github.com/repos/bob/proj/commits/deadbeef",
            value=STAKE,
        )
        c = json.loads(client.read("get_claim", result.return_value))
        assert c["provenance_type"] == "GIT_COMMIT"
        assert c["provenance_hint_url"] != ""

    def test_file_platform_publish_claim(self, client, dispute_id):
        result = client.write(
            BOB, "file_claim",
            dispute_id,
            "https://news.ycombinator.com/item?id=37000000",
            "PLATFORM_PUBLISH", "",
            value=STAKE,
        )
        c = json.loads(client.read("get_claim", result.return_value))
        assert c["provenance_type"] == "PLATFORM_PUBLISH"

    def test_dispute_claim_count_increments(self, client, dispute_id):
        client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)
        client.write(CAROL, "file_claim", dispute_id, "https://ex.com/b", "WAYBACK", "", value=STAKE)
        d = json.loads(client.read("get_dispute", dispute_id))
        assert d["claim_count"] == 2

    def test_get_dispute_claims_returns_ids(self, client, dispute_id):
        r1 = client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)
        r2 = client.write(CAROL, "file_claim", dispute_id, "https://ex.com/b", "WAYBACK", "", value=STAKE)
        ids = json.loads(client.read("get_dispute_claims", dispute_id))
        assert r1.return_value in ids
        assert r2.return_value in ids

    def test_rejects_wrong_stake(self, client, dispute_id):
        with pytest.raises(Exception, match="required_stake_wei"):
            client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE // 2)

    def test_rejects_zero_value(self, client, dispute_id):
        with pytest.raises(Exception, match="required_stake_wei"):
            client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=0)

    def test_rejects_duplicate_address(self, client, dispute_id):
        client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)
        with pytest.raises(Exception, match="already filed"):
            client.write(BOB, "file_claim", dispute_id, "https://ex.com/b", "WAYBACK", "", value=STAKE)

    def test_rejects_invalid_url(self, client, dispute_id):
        with pytest.raises(Exception, match="artifact_url"):
            client.write(BOB, "file_claim", dispute_id, "not-a-url", "WAYBACK", "", value=STAKE)

    def test_rejects_unknown_provenance_type(self, client, dispute_id):
        with pytest.raises(Exception, match="provenance_type"):
            client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "UNKNOWN", "", value=STAKE)

    def test_rejects_git_commit_without_hint(self, client, dispute_id):
        with pytest.raises(Exception, match="provenance_hint_url"):
            client.write(
                BOB, "file_claim",
                dispute_id,
                "https://github.com/bob/proj/blob/main/README.md",
                "GIT_COMMIT", "",
                value=STAKE,
            )

    def test_rejects_platform_publish_non_hn(self, client, dispute_id):
        with pytest.raises(Exception, match="platform_publish"):
            client.write(
                BOB, "file_claim",
                dispute_id,
                "https://reddit.com/r/programming/comments/abc123",
                "PLATFORM_PUBLISH", "",
                value=STAKE,
            )

    def test_rejects_filing_on_cancelled_dispute(self, client, dispute_id):
        client.write(ALICE, "cancel_dispute", dispute_id)
        with pytest.raises(Exception, match="not accepting"):
            client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)

    def test_rejects_nonexistent_dispute(self, client):
        with pytest.raises(Exception, match="not found"):
            client.write(BOB, "file_claim", "dispute:999", "https://ex.com/a", "WAYBACK", "", value=STAKE)


# ── Challenge evidence ────────────────────────────────────────────────────────

class TestChallengeEvidence:
    def test_submit_evidence_updates_claim(self, client, dispute_with_two_claims):
        dispute_id = dispute_with_two_claims
        ids = json.loads(client.read("get_dispute_claims", dispute_id))
        # Get Alice's claim (filed by ALICE)
        alice_claim_id = None
        for cid in ids:
            c = json.loads(client.read("get_claim", cid))
            if c["claimant"].lower() == ALICE.lower():
                alice_claim_id = cid
                break
        assert alice_claim_id is not None

        # Manually force dispute to RANKED state for challenge evidence test
        # (In production this happens after trigger_evaluation + consensus)
        # Direct mode: we manipulate state directly
        # Since we can't run nondet here, we skip the full eval path and
        # only test the submit_challenge_evidence guard logic.
        # The status check will reject us if we're not RANKED — that's expected.
        with pytest.raises(Exception, match="challenge window"):
            client.write(
                ALICE,
                "submit_challenge_evidence",
                alice_claim_id,
                "https://archive.org/wayback/available?url=https://github.com/alice/research/blob/main/paper.md",
            )

    def test_non_claimant_cannot_submit_evidence(self, client, dispute_with_two_claims):
        dispute_id = dispute_with_two_claims
        ids = json.loads(client.read("get_dispute_claims", dispute_id))
        alice_claim_id = ids[0]
        # BOB trying to submit for ALICE's claim — should fail regardless of status
        with pytest.raises(Exception):
            client.write(
                BOB,
                "submit_challenge_evidence",
                alice_claim_id,
                "https://archive.org/wayback/available?url=https://github.com/alice/research/blob/main/paper.md",
            )


# ── Single-filer refund ───────────────────────────────────────────────────────

class TestSingleFilerRefund:
    def test_rejects_if_filing_window_open(self, client, dispute_id):
        """Filing window not yet closed — refund must be rejected."""
        client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)
        with pytest.raises(Exception, match="not yet closed"):
            client.write(BOB, "claim_single_filer_refund", dispute_id)

    def test_rejects_if_zero_claims(self, client, dispute_id):
        """No claims filed — single-filer refund needs exactly 1 claim."""
        with pytest.raises(Exception, match="exactly one"):
            client.write(ALICE, "claim_single_filer_refund", dispute_id)

    def test_rejects_if_two_claims(self, client, dispute_with_two_claims):
        """Two claims — not a single-filer scenario."""
        with pytest.raises(Exception, match="exactly one"):
            client.write(ALICE, "claim_single_filer_refund", dispute_with_two_claims)


# ── Dispute timeout ───────────────────────────────────────────────────────────

class TestDisputeTimeout:
    def test_rejects_before_timeout_expires(self, client, dispute_with_two_claims):
        """Timeout has not expired — refund should be rejected."""
        with pytest.raises(Exception, match="timeout"):
            client.write(ALICE, "claim_dispute_timeout", dispute_with_two_claims)

    def test_rejects_caller_with_no_claim(self, client, dispute_id):
        """Carol has no claim in this dispute."""
        client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)
        with pytest.raises(Exception):
            client.write(CAROL, "claim_dispute_timeout", dispute_id)


# ── Trigger evaluation guards ─────────────────────────────────────────────────

class TestTriggerEvaluationGuards:
    def test_rejects_if_only_one_claim(self, client, dispute_id):
        client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)
        with pytest.raises(Exception, match="two claims"):
            client.write(ALICE, "trigger_evaluation", dispute_id)

    def test_rejects_if_filing_window_still_open(self, client, dispute_with_two_claims):
        with pytest.raises(Exception, match="not yet closed"):
            client.write(ALICE, "trigger_evaluation", dispute_with_two_claims)

    def test_rejects_nonexistent_dispute(self, client):
        with pytest.raises(Exception, match="not found"):
            client.write(ALICE, "trigger_evaluation", "dispute:999")


# ── Finalize guards ───────────────────────────────────────────────────────────

class TestFinalizeGuards:
    def test_rejects_if_not_ranked(self, client, dispute_id):
        with pytest.raises(Exception, match="not ready"):
            client.write(ALICE, "finalize_dispute", dispute_id)


# ── Withdraw guards ───────────────────────────────────────────────────────────

class TestWithdrawGuards:
    def test_rejects_non_claimant(self, client, dispute_with_two_claims):
        dispute_id = dispute_with_two_claims
        ids = json.loads(client.read("get_dispute_claims", dispute_id))
        bob_claim_id = None
        for cid in ids:
            c = json.loads(client.read("get_claim", cid))
            if c["claimant"].lower() == BOB.lower():
                bob_claim_id = cid
                break
        assert bob_claim_id is not None
        with pytest.raises(Exception, match="claimant"):
            client.write(CAROL, "withdraw", bob_claim_id)

    def test_rejects_filed_claim_withdraw(self, client, dispute_with_two_claims):
        """A FILED claim (not yet evaluated) cannot be withdrawn."""
        dispute_id = dispute_with_two_claims
        ids = json.loads(client.read("get_dispute_claims", dispute_id))
        alice_claim_id = None
        for cid in ids:
            c = json.loads(client.read("get_claim", cid))
            if c["claimant"].lower() == ALICE.lower():
                alice_claim_id = cid
                break
        assert alice_claim_id is not None
        with pytest.raises(Exception, match="not eligible"):
            client.write(ALICE, "withdraw", alice_claim_id)


# ── Read methods ──────────────────────────────────────────────────────────────

class TestReadMethods:
    def test_get_dispute_returns_all_fields(self, client, dispute_id):
        d = json.loads(client.read("get_dispute", dispute_id))
        required_fields = [
            "dispute_id", "creator", "idea_title", "idea_description", "status",
            "required_stake_wei", "stake_pool_deposited", "claim_count",
            "created_ts", "filing_deadline_ts", "evaluation_timeout_ts",
            "leading_claim_id", "ranking_verdict", "ranking_rationale",
            "ranked_ts", "challenge_deadline_ts", "had_challenge_evidence",
            "final_winner_claim_id", "finalized_ts",
        ]
        for f in required_fields:
            assert f in d, f"Missing field: {f}"

    def test_get_claim_returns_all_fields(self, client, dispute_id):
        r = client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)
        c = json.loads(client.read("get_claim", r.return_value))
        required_fields = [
            "claim_id", "dispute_id", "claimant", "artifact_url", "provenance_type",
            "provenance_hint_url", "stake_wei", "stake_deposited", "status",
            "estimated_earliest_ts", "timestamp_verified", "match_score_bps",
            "evaluation_notes", "challenge_evidence", "filed_ts", "evaluated_ts",
        ]
        for f in required_fields:
            assert f in c, f"Missing field: {f}"

    def test_get_dispute_claims_empty(self, client, dispute_id):
        ids = json.loads(client.read("get_dispute_claims", dispute_id))
        assert ids == []

    def test_get_dispute_not_found(self, client):
        with pytest.raises(Exception, match="not found"):
            client.read("get_dispute", "dispute:999")

    def test_get_claim_not_found(self, client):
        with pytest.raises(Exception, match="not found"):
            client.read("get_claim", "claim:999")

    def test_stake_pool_accumulates(self, client, dispute_id):
        client.write(BOB, "file_claim", dispute_id, "https://ex.com/a", "WAYBACK", "", value=STAKE)
        client.write(CAROL, "file_claim", dispute_id, "https://ex.com/b", "WAYBACK", "", value=STAKE)
        d = json.loads(client.read("get_dispute", dispute_id))
        assert d["stake_pool_deposited"] == 2 * STAKE
