"""
Direct-mode tests: these load contracts/VeritasDisputes.py under the real GenVM SDK and execute its
real leader_fn / validator_fn. Only the outside world (web + LLM) is mocked. Value transfers
(emit_transfer) are captured through the harness gl_call hook so exact recipients and amounts are asserted.

Run:  pip install "genlayer-test==0.29.2"  &&  pytest tests -q -p no:cacheprovider

The SDK bundle version is pinned (GENVM_SDK_VERSION, default v0.2.16). Left unpinned, the harness asks
GitHub for the "latest" release, which can be a release candidate with no downloadable bundle.

What this proves: contract logic, state guards, fund paths, the deterministic ranking, and the validator's
agreement rules against independently mocked evidence. What it does not prove: real LLM behaviour, real
network behaviour, or real multi-node consensus timing.
"""
import json
import os
import re

import pytest

CONTRACT = "contracts/VeritasDisputes.py"
SDK = os.environ.get("GENVM_SDK_VERSION", "v0.2.16")
STAKE = 10**18
DAY = 86400

SHA = "a" * 40
ALICE_URL = "https://github.com/alice/research/blob/main/paper.md"
ALICE_HINT = f"https://api.github.com/repos/alice/research/commits/{SHA}"
ALICE_RAW_MAIN = "https://github.com/alice/research/raw/main/paper.md"
ALICE_RAW_SHA = f"https://github.com/alice/research/raw/{SHA}/paper.md"
ALICE_TEXT = "ALICE_ARTIFACT neural hash compression using locality sensitive hashing"

BOB_URL = "https://bob.example/post"
BOB_QUERY = "https://archive.org/wayback/available?url=https://bob.example/post"
BOB_TEXT = "BOB_ARTIFACT neural hash compression using locality sensitive hashing"

HN_URL = "https://news.ycombinator.com/item?id=123"
HN_API = "https://hacker-news.firebaseio.com/v0/item/123.json"


# ------------------------------------------------------------------ helpers
def addr(account):
    return "0x" + bytes(account).hex() if isinstance(account, (bytes, bytearray)) else str(account).lower()


def j(value):
    return json.loads(value) if isinstance(value, str) else value


def at(vm, hhmmss, day="2026-10-05"):
    vm.warp(f"{day}T{hhmmss}Z")


def reverts(message):
    return pytest.raises(Exception, match=re.escape(message))


def deploy(direct_deploy):
    return direct_deploy(CONTRACT, sdk_version=SDK)


@pytest.fixture
def sent(direct_vm):
    """Captures every emit_transfer as (recipient, amount)."""
    log = []

    def hook(vm, request):
        if "EthSend" in request:
            e = request["EthSend"]
            log.append((e["address"].as_hex.lower(), int(e["value"])))
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = hook
    return log


def commit_json(date):
    return json.dumps({"commit": {"committer": {"date": date}}})


def wayback_json(ts, original=BOB_URL):
    return json.dumps({"archived_snapshots": {"closest": {
        "available": True, "timestamp": ts,
        "url": f"http://web.archive.org/web/{ts}/{original}"}}})


def world(alice_date="2024-01-01T00:00:00Z", bob_ts="20230101000000", alice_text=ALICE_TEXT,
          bob_text=BOB_TEXT, extra=None):
    """Every page both claims need, keyed by exact URL -> (status, body)."""
    p = {
        ALICE_RAW_MAIN: (200, alice_text),
        ALICE_RAW_SHA: (200, alice_text),
        ALICE_HINT: (200, commit_json(alice_date)),
        BOB_URL: (200, bob_text),
        BOB_QUERY: (200, wayback_json(bob_ts)),
        f"http://web.archive.org/web/{bob_ts}id_/{BOB_URL}": (200, bob_text),
    }
    p.update(extra or {})
    return p


def serve(vm, pages, scores=None):
    """Replace all mocks. scores maps an artifact marker to the model's answer (dict, or a raw str)."""
    vm.clear_mocks()
    for url, (status, body) in pages.items():
        vm.mock_web("^" + re.escape(url) + "$", {"status": status, "body": body})
    for marker, answer in (scores or {"ALICE_ARTIFACT": 9000, "BOB_ARTIFACT": 9000}).items():
        payload = answer if isinstance(answer, str) else json.dumps(
            {"match_score_bps": answer, "notes": f"{marker} compared against the disputed idea"})
        vm.mock_llm(re.escape(marker), payload)


def new_dispute(c, vm, who, filing=900, challenge=7200):
    at(vm, "10:00:00")
    vm.sender = who
    return c.create_dispute("Neural hash compression", "Hashing network weights with LSH.", STAKE, filing, challenge)


def file_claim(c, vm, who, dispute_id, url, ptype, hint="", stake=STAKE, hhmmss=None):
    if hhmmss:
        at(vm, hhmmss)
    vm.sender = who
    vm.value = stake
    try:
        return c.file_claim(dispute_id, url, ptype, hint)
    finally:
        vm.value = 0


def two_claims(c, vm, alice, bob):
    did = new_dispute(c, vm, alice)
    file_claim(c, vm, alice, did, ALICE_URL, "GIT_COMMIT", ALICE_HINT, hhmmss="10:00:01")
    file_claim(c, vm, bob, did, BOB_URL, "WAYBACK", "", hhmmss="10:00:02")
    return did


def ranked(c, vm, alice, bob, pages=None, scores=None):
    did = two_claims(c, vm, alice, bob)
    serve(vm, pages or world(), scores)
    at(vm, "10:15:01")
    c.trigger_evaluation(did)
    return did


def ranked_existing(c, vm, did, pages=None, scores=None):
    serve(vm, pages or world(), scores)
    at(vm, "10:15:01")
    c.trigger_evaluation(did)
    return did


def finalized(c, vm, alice, bob, pages=None, scores=None):
    did = ranked(c, vm, alice, bob, pages, scores)
    at(vm, "12:15:02")
    c.finalize_dispute(did)
    return did


# ------------------------------------------------------------------ creation and cancellation
def test_create_dispute_stores_record_and_sequential_ids(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    d0 = new_dispute(c, direct_vm, direct_alice)
    d1 = new_dispute(c, direct_vm, direct_alice)
    assert (d0, d1) == ("dispute:0", "dispute:1")
    rec = j(c.get_dispute(d0))
    assert rec["status"] == "FILING_OPEN" and rec["required_stake_wei"] == STAKE
    assert rec["creator"].lower() == addr(direct_alice) and rec["claim_count"] == 0
    assert rec["filing_deadline_ts"] - rec["created_ts"] == 900
    assert j(c.get_contract_info())["total_disputes"] == 2


@pytest.mark.parametrize("args,message", [
    (("", "d", STAKE, 900, 7200), "idea_title must be 1-200"),
    (("x" * 201, "d", STAKE, 900, 7200), "idea_title must be 1-200"),
    (("t", "", STAKE, 900, 7200), "idea_description must be 1-"),
    (("t", "d", 0, 900, 7200), "required_stake_wei must be positive"),
    (("t", "d", STAKE, 899, 7200), "filing_window_seconds out of allowed range"),
    (("t", "d", STAKE, 30 * DAY + 1, 7200), "filing_window_seconds out of allowed range"),
    (("t", "d", STAKE, 900, 7199), "challenge_window_seconds out of allowed range"),
    (("t", "d", STAKE, 900, 14 * DAY + 1), "challenge_window_seconds out of allowed range"),
])
def test_create_dispute_rejects_invalid_input(direct_vm, direct_deploy, direct_alice, args, message):
    c = deploy(direct_deploy)
    at(direct_vm, "10:00:00")
    direct_vm.sender = direct_alice
    with reverts(message):
        c.create_dispute(*args)
    assert j(c.get_contract_info())["total_disputes"] == 0


def test_cancel_is_creator_only_and_only_before_any_claim(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = new_dispute(c, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    with reverts("Only the dispute creator can cancel it"):
        c.cancel_dispute(did)
    direct_vm.sender = direct_alice
    c.cancel_dispute(did)
    assert j(c.get_dispute(did))["status"] == "CANCELLED"
    with reverts("not cancellable"):
        c.cancel_dispute(did)

    d2 = new_dispute(c, direct_vm, direct_alice)
    file_claim(c, direct_vm, direct_bob, d2, BOB_URL, "WAYBACK")
    direct_vm.sender = direct_alice
    with reverts("Cannot cancel after a claim was filed"):
        c.cancel_dispute(d2)


# ------------------------------------------------------------------ filing
def test_file_claim_records_claim_and_escrows_exact_stake(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = two_claims(c, direct_vm, direct_alice, direct_bob)
    assert j(c.get_dispute_claims(did)) == ["claim:0", "claim:1"]
    d = j(c.get_dispute(did))
    assert d["claim_count"] == 2 and d["stake_pool_deposited"] == 2 * STAKE
    cl = j(c.get_claim("claim:1"))
    assert cl["claimant"].lower() == addr(direct_bob) and cl["stake_deposited"] == STAKE
    assert cl["provenance_type"] == "WAYBACK" and cl["status"] == "FILED"


@pytest.mark.parametrize("kwargs,message", [
    (dict(stake=STAKE - 1), "Must stake exactly required_stake_wei"),
    (dict(stake=STAKE + 1), "Must stake exactly required_stake_wei"),
    (dict(url="ftp://bob.example/post"), "artifact_url must be a valid http(s) URL"),
    (dict(ptype="NOTARIZED"), "Unknown provenance_type"),
    (dict(hint="not-a-url"), "provenance_hint_url must be empty or a valid http(s) URL"),
    (dict(ptype="GIT_COMMIT", hint=""), "git_commit claims require a commit API URL"),
    (dict(ptype="PLATFORM_PUBLISH", url="https://example.org/post"), "supported only for Hacker News items"),
])
def test_file_claim_rejects_invalid_input(direct_vm, direct_deploy, direct_alice, direct_bob, kwargs, message):
    c = deploy(direct_deploy)
    did = new_dispute(c, direct_vm, direct_alice)
    args = dict(url=BOB_URL, ptype="WAYBACK", hint="", stake=STAKE)
    args.update(kwargs)
    with reverts(message):
        file_claim(c, direct_vm, direct_bob, did, args["url"], args["ptype"], args["hint"], args["stake"])
    assert j(c.get_dispute(did))["claim_count"] == 0


def test_one_claim_per_address_and_window_closes(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    did = new_dispute(c, direct_vm, direct_alice)
    file_claim(c, direct_vm, direct_bob, did, BOB_URL, "WAYBACK")
    with reverts("already filed a claim"):
        file_claim(c, direct_vm, direct_bob, did, BOB_URL, "WAYBACK")
    at(direct_vm, "10:15:00")   # exactly at the deadline: still open
    file_claim(c, direct_vm, direct_charlie, did, BOB_URL, "WAYBACK")
    at(direct_vm, "10:15:01")
    with reverts("Filing window has closed"):
        file_claim(c, direct_vm, direct_alice, did, BOB_URL, "WAYBACK")


def test_claim_cap_is_enforced(direct_vm, direct_deploy, direct_alice, direct_accounts):
    c = deploy(direct_deploy)
    did = new_dispute(c, direct_vm, direct_alice)
    from gltest.direct.loader import create_address
    for i in range(12):
        file_claim(c, direct_vm, create_address(f"filer{i}"), did, BOB_URL, "WAYBACK")
    with reverts("Maximum claims reached"):
        file_claim(c, direct_vm, create_address("filer-extra"), did, BOB_URL, "WAYBACK")


# ------------------------------------------------------------------ evaluation guards
def test_trigger_evaluation_guards(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = new_dispute(c, direct_vm, direct_alice)
    file_claim(c, direct_vm, direct_alice, did, ALICE_URL, "GIT_COMMIT", ALICE_HINT)
    with reverts("Filing window has not yet closed"):
        c.trigger_evaluation(did)
    at(direct_vm, "10:15:01")
    with reverts("At least two claims are required"):
        c.trigger_evaluation(did)
    at(direct_vm, "10:15:01", day="2026-10-20")   # 14 days + after the filing deadline
    with reverts("Evaluation timeout expired"):
        c.trigger_evaluation(did)


# ------------------------------------------------------------------ resolution lifecycle
def test_earliest_verified_timestamp_wins_and_winner_withdraws_the_pool(direct_vm, direct_deploy, direct_alice, direct_bob, sent):
    direct_vm.check_pickling = True
    c = deploy(direct_deploy)
    did = ranked(c, direct_vm, direct_alice, direct_bob)       # bob 2023 beats alice 2024
    d = j(c.get_dispute(did))
    assert d["status"] == "RANKED" and d["ranking_verdict"] == "RANKED_WINNER" and d["leading_claim_id"] == "claim:1"
    assert d["challenge_deadline_ts"] - d["ranked_ts"] == 7200
    alice, bob = j(c.get_claim("claim:0")), j(c.get_claim("claim:1"))
    assert alice["timestamp_verified"] and bob["timestamp_verified"]
    assert bob["estimated_earliest_ts"] < alice["estimated_earliest_ts"]
    assert alice["match_score_bps"] == 9000 and alice["status"] == "EVALUATED"

    with reverts("Challenge window has not yet closed"):
        c.finalize_dispute(did)
    at(direct_vm, "12:15:02")
    c.finalize_dispute(did)
    assert j(c.get_dispute(did))["status"] == "FINALIZED"
    assert j(c.get_claim("claim:1"))["status"] == "WINNER" and j(c.get_claim("claim:0"))["status"] == "LOSER"

    direct_vm.sender = direct_alice
    with reverts("not eligible for withdrawal"):
        c.withdraw("claim:0")
    direct_vm.sender = direct_alice
    with reverts("Only the claimant may withdraw"):
        c.withdraw("claim:1")
    direct_vm.sender = direct_bob
    c.withdraw("claim:1")
    assert sent == [(addr(direct_bob), 2 * STAKE)]
    assert j(c.get_dispute(did))["stake_pool_deposited"] == 0
    with reverts("Nothing to withdraw"):
        c.withdraw("claim:1")
    assert len(sent) == 1


def test_near_tie_is_inconclusive_and_everyone_gets_their_own_stake_back(direct_vm, direct_deploy, direct_alice, direct_bob, sent):
    c = deploy(direct_deploy)
    pages = world(alice_date="2023-01-01T00:00:00Z", bob_ts="20230101120000")   # 12 h apart
    did = finalized(c, direct_vm, direct_alice, direct_bob, pages)
    d = j(c.get_dispute(did))
    assert d["status"] == "INCONCLUSIVE" and d["leading_claim_id"] == "" and d["final_winner_claim_id"] == ""
    for who, cid in ((direct_alice, "claim:0"), (direct_bob, "claim:1")):
        direct_vm.sender = who
        c.withdraw(cid)
    assert sorted(sent) == sorted([(addr(direct_alice), STAKE), (addr(direct_bob), STAKE)])
    assert j(c.get_dispute(did))["stake_pool_deposited"] == 0
    direct_vm.sender = direct_alice
    with reverts("Nothing to withdraw"):
        c.withdraw("claim:0")


def test_gap_just_over_tolerance_produces_a_winner(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    pages = world(alice_date="2023-01-02T00:00:01Z", bob_ts="20230101000000")   # 24 h + 1 s
    did = finalized(c, direct_vm, direct_alice, direct_bob, pages)
    assert j(c.get_dispute(did))["status"] == "FINALIZED"
    assert j(c.get_dispute(did))["final_winner_claim_id"] == "claim:1"


def test_no_claim_above_match_threshold_is_inconclusive(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = finalized(c, direct_vm, direct_alice, direct_bob, scores={"ALICE_ARTIFACT": 5999, "BOB_ARTIFACT": 100})
    assert j(c.get_dispute(did))["status"] == "INCONCLUSIVE"


def test_a_sole_eligible_claim_wins_even_if_the_other_is_earlier(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = finalized(c, direct_vm, direct_alice, direct_bob, scores={"ALICE_ARTIFACT": 6000, "BOB_ARTIFACT": 5999})
    d = j(c.get_dispute(did))
    assert d["status"] == "FINALIZED" and d["final_winner_claim_id"] == "claim:0"   # alice, though bob is earlier


@pytest.mark.parametrize("raw,expected", [("6500.7", 6500), (" 9000 ", 9000), ("99999", 10000), ("-5", 0), ("high", 0)])
def test_model_scores_are_parsed_without_floats_and_clamped(direct_vm, direct_deploy, direct_alice, direct_bob, raw, expected):
    c = deploy(direct_deploy)
    did = ranked(c, direct_vm, direct_alice, direct_bob,
                 scores={"ALICE_ARTIFACT": json.dumps({"match_score_bps": raw, "notes": "n"}), "BOB_ARTIFACT": 9000})
    assert j(c.get_claim("claim:0"))["match_score_bps"] == expected


@pytest.mark.parametrize("bad", ["not json at all", "[]", '"text"'])
def test_unusable_model_output_marks_the_claim_ineligible_instead_of_storing_garbage(direct_vm, direct_deploy, direct_alice, direct_bob, bad):
    c = deploy(direct_deploy)
    did = ranked(c, direct_vm, direct_alice, direct_bob, scores={"ALICE_ARTIFACT": bad, "BOB_ARTIFACT": 9000})
    alice = j(c.get_claim("claim:0"))
    assert alice["match_score_bps"] == 0 and "[LLM_ERROR]" in alice["evaluation_notes"]
    assert j(c.get_dispute(did))["leading_claim_id"] == "claim:1"       # only bob is eligible


@pytest.mark.parametrize("status", [403, 404, 500])
def test_http_errors_become_a_failure_marker_never_evidence(direct_vm, direct_deploy, direct_alice, direct_bob, status):
    c = deploy(direct_deploy)
    pages = world(extra={ALICE_RAW_MAIN: (status, ALICE_TEXT)})    # error page still carries the scoring marker
    did = ranked(c, direct_vm, direct_alice, direct_bob, pages)
    alice = j(c.get_claim("claim:0"))
    assert alice["match_score_bps"] == 0 and not alice["timestamp_verified"]
    assert f"HTTP {status}" in alice["evaluation_notes"]
    assert j(c.get_dispute(did))["leading_claim_id"] == "claim:1"


def test_wayback_snapshot_must_match_the_filed_artifact_content(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    pages = world(extra={f"http://web.archive.org/web/20230101000000id_/{BOB_URL}": (200, BOB_TEXT + " edited later")})
    ranked(c, direct_vm, direct_alice, direct_bob, pages)
    bob = j(c.get_claim("claim:1"))
    assert not bob["timestamp_verified"] and "digest does not match" in bob["evaluation_notes"]


def test_git_commit_must_be_bound_to_the_artifact_repository(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = new_dispute(c, direct_vm, direct_alice)
    other = "https://api.github.com/repos/mallory/other/commits/" + SHA
    file_claim(c, direct_vm, direct_alice, did, ALICE_URL, "GIT_COMMIT", other, hhmmss="10:00:01")
    file_claim(c, direct_vm, direct_bob, did, BOB_URL, "WAYBACK", "", hhmmss="10:00:02")
    serve(direct_vm, world(extra={other: (200, commit_json("2000-01-01T00:00:00Z"))}))
    at(direct_vm, "10:15:01")
    c.trigger_evaluation(did)
    alice = j(c.get_claim("claim:0"))
    assert not alice["timestamp_verified"] and "not bound to the filed artifact repository" in alice["evaluation_notes"]


def test_hacker_news_publish_time_is_used_and_must_echo_the_item_id(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = new_dispute(c, direct_vm, direct_alice)
    file_claim(c, direct_vm, direct_alice, did, ALICE_URL, "GIT_COMMIT", ALICE_HINT, hhmmss="10:00:01")
    file_claim(c, direct_vm, direct_bob, did, HN_URL, "PLATFORM_PUBLISH", "", hhmmss="10:00:02")
    hn = json.dumps({"id": 123, "time": 1700000000, "title": "BOB_ARTIFACT show hn", "text": "LSH hashing", "url": ""})
    pages = {k: v for k, v in world().items() if "bob" not in k and "archive" not in k}
    pages[HN_API] = (200, hn)
    serve(direct_vm, pages)
    at(direct_vm, "10:15:01")
    c.trigger_evaluation(did)
    assert j(c.get_claim("claim:1"))["estimated_earliest_ts"] == 1700000000
    assert j(c.get_dispute(did))["leading_claim_id"] == "claim:1"

    d2 = new_dispute(c, direct_vm, direct_alice)
    file_claim(c, direct_vm, direct_alice, d2, ALICE_URL, "GIT_COMMIT", ALICE_HINT, hhmmss="10:00:01")
    file_claim(c, direct_vm, direct_bob, d2, HN_URL, "PLATFORM_PUBLISH", "", hhmmss="10:00:02")
    pages[HN_API] = (200, json.dumps({"id": 999, "time": 1, "title": "BOB_ARTIFACT", "text": "", "url": ""}))
    serve(direct_vm, pages)
    at(direct_vm, "10:15:01")
    c.trigger_evaluation(d2)
    bob2 = j(c.get_claim("claim:3"))
    assert not bob2["timestamp_verified"] and "not bound to the filed artifact" in bob2["evaluation_notes"]


# ------------------------------------------------------------------ challenge evidence and the second, independent round
def test_challenge_evidence_is_claimant_only_url_checked_bounded_and_windowed(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    early = two_claims(c, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    with reverts("not in its challenge window"):
        c.submit_challenge_evidence("claim:1", "https://archive.org/x")
    did = ranked_existing(c, direct_vm, early)
    at(direct_vm, "11:00:00")
    direct_vm.sender = direct_charlie
    with reverts("Only the claimant may submit evidence"):
        c.submit_challenge_evidence("claim:1", "https://archive.org/x")
    direct_vm.sender = direct_bob
    with reverts("evidence_url must be a valid http(s) URL"):
        c.submit_challenge_evidence("claim:1", "ipfs://nope")
    for i in range(5):
        c.submit_challenge_evidence("claim:1", f"https://archive.org/e{i}")
    with reverts("Maximum challenge evidence submissions reached"):
        c.submit_challenge_evidence("claim:1", "https://archive.org/e5")
    assert len(j(c.get_claim("claim:1"))["challenge_evidence"]) == 5 and j(c.get_dispute(did))["had_challenge_evidence"]
    at(direct_vm, "12:15:02")
    with reverts("Challenge window has closed"):
        c.submit_challenge_evidence("claim:1", "https://archive.org/late")


def test_finalize_reruns_evaluation_and_can_overturn_the_first_ranking(direct_vm, direct_deploy, direct_alice, direct_bob, sent):
    c = deploy(direct_deploy)
    first = world(alice_date="2023-01-01T00:00:00Z", bob_ts="20240601000000")
    did = ranked(c, direct_vm, direct_alice, direct_bob, first)
    assert j(c.get_dispute(did))["leading_claim_id"] == "claim:0"           # alice leads after round one

    earlier = "https://archive.org/wayback/available?url=https://bob.example/post&timestamp=2020"
    at(direct_vm, "11:00:00")
    direct_vm.sender = direct_bob
    c.submit_challenge_evidence("claim:1", earlier)
    second = world(alice_date="2023-01-01T00:00:00Z", bob_ts="20240601000000", extra={
        earlier: (200, wayback_json("20200101000000")),
        f"http://web.archive.org/web/20200101000000id_/{BOB_URL}": (200, BOB_TEXT)})
    serve(direct_vm, second)
    at(direct_vm, "12:15:02")
    c.finalize_dispute(did)
    d = j(c.get_dispute(did))
    assert d["status"] == "FINALIZED" and d["final_winner_claim_id"] == "claim:1"
    direct_vm.sender = direct_bob
    c.withdraw("claim:1")
    assert sent == [(addr(direct_bob), 2 * STAKE)]


def test_challenge_evidence_that_does_not_bind_to_the_artifact_changes_nothing(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = ranked(c, direct_vm, direct_alice, direct_bob, world(alice_date="2023-01-01T00:00:00Z", bob_ts="20240601000000"))
    at(direct_vm, "11:00:00")
    direct_vm.sender = direct_bob
    wrong = "https://archive.org/wayback/available?url=https://someone-else.example/page&timestamp=2020"
    c.submit_challenge_evidence("claim:1", wrong)
    serve(direct_vm, world(alice_date="2023-01-01T00:00:00Z", bob_ts="20240601000000",
                           extra={wrong: (200, wayback_json("20200101000000", "https://someone-else.example/page"))}))
    at(direct_vm, "12:15:02")
    c.finalize_dispute(did)
    assert j(c.get_dispute(did))["final_winner_claim_id"] == "claim:0"


# ------------------------------------------------------------------ bounded exits
def test_single_filer_refund(direct_vm, direct_deploy, direct_alice, direct_bob, sent):
    c = deploy(direct_deploy)
    did = new_dispute(c, direct_vm, direct_alice)
    file_claim(c, direct_vm, direct_alice, did, ALICE_URL, "GIT_COMMIT", ALICE_HINT)
    direct_vm.sender = direct_alice
    with reverts("Filing window has not yet closed"):
        c.claim_single_filer_refund(did)
    at(direct_vm, "10:15:01")
    direct_vm.sender = direct_bob
    with reverts("Only the sole claimant may claim this refund"):
        c.claim_single_filer_refund(did)
    direct_vm.sender = direct_alice
    c.claim_single_filer_refund(did)
    assert sent == [(addr(direct_alice), STAKE)]
    assert j(c.get_dispute(did))["status"] == "TIMED_OUT" and j(c.get_claim("claim:0"))["status"] == "REFUNDED"
    with reverts("Dispute is not in FILING_OPEN state"):
        c.claim_single_filer_refund(did)


def test_single_filer_refund_needs_exactly_one_claim(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = two_claims(c, direct_vm, direct_alice, direct_bob)
    at(direct_vm, "10:15:01")
    direct_vm.sender = direct_alice
    with reverts("requires exactly one claim"):
        c.claim_single_filer_refund(did)


def test_timeout_refund_when_evaluation_is_never_triggered(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, sent):
    c = deploy(direct_deploy)
    did = two_claims(c, direct_vm, direct_alice, direct_bob)
    at(direct_vm, "10:15:00", day="2026-10-19")           # exactly 14 days after the deadline: still inside
    direct_vm.sender = direct_alice
    with reverts("Evaluation timeout has not yet expired"):
        c.claim_dispute_timeout(did)
    at(direct_vm, "10:15:01", day="2026-10-20")
    c.claim_dispute_timeout(did)
    with reverts("Already refunded"):
        c.claim_dispute_timeout(did)
    direct_vm.sender = direct_charlie
    with reverts("Caller has no claim in this dispute"):
        c.claim_dispute_timeout(did)
    direct_vm.sender = direct_bob
    c.claim_dispute_timeout(did)
    assert sorted(sent) == sorted([(addr(direct_alice), STAKE), (addr(direct_bob), STAKE)])
    assert j(c.get_dispute(did))["stake_pool_deposited"] == 0


def test_ranked_dispute_that_is_never_finalized_has_a_bounded_exit(direct_vm, direct_deploy, direct_alice, direct_bob, sent):
    c = deploy(direct_deploy)
    did = ranked(c, direct_vm, direct_alice, direct_bob)           # challenge window closes 12:15:01
    direct_vm.sender = direct_alice
    at(direct_vm, "12:15:01", day="2026-10-19")           # exactly 14 days after the challenge window
    with reverts("Finalization timeout has not yet expired"):
        c.claim_dispute_timeout(did)
    at(direct_vm, "12:15:02", day="2026-10-20")                    # more than 14 days after the challenge window
    with reverts("Finalization window expired"):
        c.finalize_dispute(did)                                    # a payout can no longer race the refunds
    c.claim_dispute_timeout(did)
    direct_vm.sender = direct_bob
    c.claim_dispute_timeout(did)
    assert sorted(sent) == sorted([(addr(direct_alice), STAKE), (addr(direct_bob), STAKE)])


def test_finalized_dispute_cannot_use_the_timeout_path(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = finalized(c, direct_vm, direct_alice, direct_bob)
    at(direct_vm, "10:00:00", day="2027-01-01")
    direct_vm.sender = direct_alice
    with reverts("Timeout refund only available before finalization"):
        c.claim_dispute_timeout(did)


def test_unknown_ids_revert(direct_vm, direct_deploy):
    c = deploy(direct_deploy)
    for call in (lambda: c.get_dispute("dispute:9"), lambda: c.get_claim("claim:9"), lambda: c.withdraw("claim:9")):
        with reverts("not found"):
            call()


# ------------------------------------------------------------------ validator agreement (the consensus rules)
def test_validator_agrees_when_it_independently_reaches_the_same_result(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    ranked(c, direct_vm, direct_alice, direct_bob)
    assert direct_vm.run_validator() is True


def test_validator_tolerates_score_drift_on_the_same_side_of_the_threshold(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    ranked(c, direct_vm, direct_alice, direct_bob)
    serve(direct_vm, world(), {"ALICE_ARTIFACT": 7600, "BOB_ARTIFACT": 9000})
    assert direct_vm.run_validator() is True


def test_validator_rejects_a_score_that_crosses_the_threshold_by_a_wide_margin(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    ranked(c, direct_vm, direct_alice, direct_bob)
    serve(direct_vm, world(), {"ALICE_ARTIFACT": 3000, "BOB_ARTIFACT": 9000})
    assert direct_vm.run_validator() is False


def test_validator_tolerates_a_small_timestamp_difference_but_not_a_large_one(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    ranked(c, direct_vm, direct_alice, direct_bob)
    serve(direct_vm, world(alice_date="2024-01-01T05:00:00Z"))      # 5 h: inside the 6 h tolerance
    assert direct_vm.run_validator() is True
    serve(direct_vm, world(alice_date="2024-01-01T07:00:00Z"))      # 7 h: outside it
    assert direct_vm.run_validator() is False


def test_validator_rejects_a_different_artifact_digest(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    ranked(c, direct_vm, direct_alice, direct_bob)
    serve(direct_vm, world(alice_text=ALICE_TEXT + " (changed)"))
    assert direct_vm.run_validator() is False


def test_validator_rejects_when_it_can_verify_a_timestamp_the_leader_could_not(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    ranked(c, direct_vm, direct_alice, direct_bob, world(extra={f"http://web.archive.org/web/20230101000000id_/{BOB_URL}": (200, "tampered")}))
    serve(direct_vm, world())
    assert direct_vm.run_validator() is False


def test_validator_agrees_on_the_same_external_failure_and_rejects_a_different_one(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    ranked(c, direct_vm, direct_alice, direct_bob, world(extra={ALICE_RAW_MAIN: (404, "")}))
    serve(direct_vm, world(extra={ALICE_RAW_MAIN: (404, "")}))
    assert direct_vm.run_validator() is True
    serve(direct_vm, world())                                       # validator can fetch what the leader could not
    assert direct_vm.run_validator() is False


def test_validator_rejects_a_leader_that_errored_or_returned_junk(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    ranked(c, direct_vm, direct_alice, direct_bob)
    assert direct_vm.run_validator(leader_error=Exception("boom")) is False
    assert direct_vm.run_validator(leader_result="junk") is False
    assert direct_vm.run_validator(leader_result={"results": {}}) is False


def test_validator_also_guards_the_challenge_round(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    did = ranked(c, direct_vm, direct_alice, direct_bob)
    at(direct_vm, "11:00:00")
    direct_vm.sender = direct_bob
    c.submit_challenge_evidence("claim:1", BOB_QUERY + "&timestamp=2020")
    serve(direct_vm, world())
    at(direct_vm, "12:15:02")
    c.finalize_dispute(did)
    assert direct_vm.run_validator() is True
    serve(direct_vm, world(alice_text="something else entirely"))
    assert direct_vm.run_validator() is False
