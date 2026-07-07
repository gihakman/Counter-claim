"""Direct-mode tests for Counterclaim.

Direct mode runs a contract in-process with mocked LLM and web calls. It
verifies deterministic state transitions and equivalence-block wiring, but
does NOT exercise validator consensus (that lives in integration tests).
"""

import json

import pytest


CONTRACT_PATH = "contracts/counterclaim.py"

CTOR_MIN_FEE = 10**15          # 0.001 GEN
CTOR_FEE_BPS = 100             # 1.00%
CTOR_FEE_RECIPIENT = ""        # empty -> deployer

SAMPLE_RULE = (
    "Airdrop Eligibility Criteria:\n"
    "C1: Wallet made at least 5 on-chain transactions before the snapshot.\n"
    "C2: Wallet is not on the Sybil blocklist.\n"
    "C3: Wallet held at least $100 in bridged assets on the snapshot date.\n"
)
SAMPLE_EVIDENCE = (
    "The petitioner's wallet (0xdeadbeef...) had 34 transactions before "
    "the snapshot, was not on the published Sybil blocklist, and held "
    "$412 in bridged USDC on the snapshot date."
)
SAMPLE_DECISION = "0 tokens, marked Sybil"

MOCK_VERDICT = {
    "decision": "out_of_policy",
    "confidence": "high",
    "findings": [
        {
            "condition_id": "C1",
            "description": "At least 5 on-chain transactions",
            "met": True,
            "confidence": "high",
        },
        {
            "condition_id": "C2",
            "description": "Not on the Sybil blocklist",
            "met": True,
            "confidence": "high",
        },
        {
            "condition_id": "C3",
            "description": "At least $100 bridged on snapshot date",
            "met": True,
            "confidence": "high",
        },
    ],
    "rationale": (
        "The rule requires three conditions and the evidence satisfies "
        "all three. Marking the wallet Sybil despite meeting every posted "
        "criterion is out of policy."
    ),
}


def _deploy(direct_deploy):
    return direct_deploy(
        CONTRACT_PATH,
        CTOR_MIN_FEE,
        CTOR_FEE_RECIPIENT,
        CTOR_FEE_BPS,
    )


def _addr_hex(addr) -> str:
    """Normalize a gltest address fixture to a lowercase 0x-hex string."""
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + bytes(addr).hex()
    # Try SDK Address type
    as_hex = getattr(addr, "as_hex", None)
    if as_hex:
        return as_hex.lower()
    return str(addr).lower()


def _mock_verdict(direct_vm, verdict: dict) -> None:
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", json.dumps(verdict))


def test_fee_config_reports_constructor_values(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    cfg = contract.fee_config()
    assert cfg["fee_bps"] == CTOR_FEE_BPS
    assert cfg["min_fee"] == str(CTOR_MIN_FEE)
    assert cfg["fees_accrued"] == "0"
    # fee_recipient falls back to deployer when constructor arg is empty
    assert cfg["fee_recipient"].lower() == _addr_hex(direct_alice)


def test_file_case_stores_case_and_charges_fee(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE
    case_id = contract.file_case(
        "ProjectX Airdrop",
        SAMPLE_RULE,
        SAMPLE_DECISION,
        SAMPLE_EVIDENCE,
    )
    assert case_id == 1

    case = contract.get_case(1)
    assert case["id"] == 1
    assert case["status"] == "pending"
    assert case["respondent_label"] == "ProjectX Airdrop"
    assert case["rule_source"] == "inline"
    assert case["rule_text"] == SAMPLE_RULE
    assert case["decision_challenged"] == SAMPLE_DECISION
    assert case["evidence_text"] == SAMPLE_EVIDENCE
    assert case["fee_paid"] == str(CTOR_MIN_FEE)
    assert case["petitioner"].lower() == _addr_hex(direct_alice)
    assert case["verdict_decision"] == ""
    assert case["findings"] == []

    assert contract.total_cases() == 1
    listed = contract.list_cases(0, 10)
    assert len(listed) == 1
    assert listed[0]["id"] == 1


def test_file_case_rejects_underpaid_fee(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE - 1
    with direct_vm.expect_revert("petition fee below min_fee"):
        contract.file_case(
            "ProjectX", SAMPLE_RULE, SAMPLE_DECISION, SAMPLE_EVIDENCE
        )


def test_file_case_rejects_oversize_inputs(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE
    with direct_vm.expect_revert("rule_text length must be 1"):
        contract.file_case(
            "ProjectX", "x" * 20_001, SAMPLE_DECISION, SAMPLE_EVIDENCE
        )


def test_adjudicate_records_verdict_and_findings(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE
    contract.file_case(
        "ProjectX Airdrop", SAMPLE_RULE, SAMPLE_DECISION, SAMPLE_EVIDENCE
    )

    _mock_verdict(direct_vm, MOCK_VERDICT)
    direct_vm.value = 0
    contract.adjudicate(1)

    case = contract.get_case(1)
    assert case["status"] == "adjudicated"
    assert case["verdict_decision"] == "out_of_policy"
    assert case["verdict_confidence"] == "high"
    assert "out of policy" in case["verdict_rationale"].lower()
    finding_ids = [f["condition_id"] for f in case["findings"]]
    assert finding_ids == ["C1", "C2", "C3"]
    assert all(f["met"] is True for f in case["findings"])


def test_adjudicate_rejects_invalid_llm_output(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE
    contract.file_case(
        "ProjectX Airdrop", SAMPLE_RULE, SAMPLE_DECISION, SAMPLE_EVIDENCE
    )

    # Missing the required `findings` field
    bad = {
        "decision": "out_of_policy",
        "confidence": "high",
        "findings": [],
        "rationale": "no findings",
    }
    _mock_verdict(direct_vm, bad)
    direct_vm.value = 0
    with direct_vm.expect_revert("at least one finding"):
        contract.adjudicate(1)


def test_appeal_only_by_petitioner_and_only_once(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE
    contract.file_case(
        "ProjectX Airdrop", SAMPLE_RULE, SAMPLE_DECISION, SAMPLE_EVIDENCE
    )
    _mock_verdict(direct_vm, MOCK_VERDICT)
    direct_vm.value = 0
    contract.adjudicate(1)

    # Non-petitioner cannot appeal
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only petitioner may appeal"):
        contract.appeal(1)

    # Petitioner can appeal exactly once
    direct_vm.sender = direct_alice
    contract.appeal(1)
    assert contract.get_case(1)["status"] == "appealed"
    assert contract.get_case(1)["appeal_count"] == 1

    # Cannot appeal a case that is already appealed
    with direct_vm.expect_revert("case is not appealable"):
        contract.appeal(1)


def test_readjudication_after_appeal_finalises(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE
    contract.file_case(
        "ProjectX Airdrop", SAMPLE_RULE, SAMPLE_DECISION, SAMPLE_EVIDENCE
    )
    _mock_verdict(direct_vm, MOCK_VERDICT)
    direct_vm.value = 0
    contract.adjudicate(1)
    contract.appeal(1)

    # Second adjudication after appeal marks the case final
    changed = dict(MOCK_VERDICT)
    changed["confidence"] = "med"
    _mock_verdict(direct_vm, changed)
    contract.adjudicate(1)

    case = contract.get_case(1)
    assert case["status"] == "final"
    assert case["verdict_confidence"] == "med"
    assert case["appeal_count"] == 1


def test_file_case_from_url_rejects_disallowed_tld(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE
    with direct_vm.expect_revert("common TLD"):
        contract.file_case_from_url(
            "ProjectX",
            "https://example.xyz/rules.html",
            SAMPLE_DECISION,
            SAMPLE_EVIDENCE,
        )


def test_file_case_from_url_stores_snapshot(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.mock_web(
        r".*eligibility\.example\.org.*",
        {"status": 200, "body": SAMPLE_RULE},
    )

    direct_vm.value = CTOR_MIN_FEE
    case_id = contract.file_case_from_url(
        "ProjectX",
        "https://eligibility.example.org/airdrop-rules",
        SAMPLE_DECISION,
        SAMPLE_EVIDENCE,
    )
    assert case_id == 1
    case = contract.get_case(1)
    assert case["rule_source"].startswith("https://eligibility.example.org/")
    # Whitespace collapse: the stored text no longer contains newlines
    assert "\n" not in case["rule_text"]
    assert "Airdrop Eligibility Criteria" in case["rule_text"]


def test_list_cases_pagination(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    for i in range(3):
        direct_vm.value = CTOR_MIN_FEE
        contract.file_case(
            f"Project{i}",
            SAMPLE_RULE,
            SAMPLE_DECISION,
            SAMPLE_EVIDENCE,
        )
    assert contract.total_cases() == 3

    page = contract.list_cases(1, 1)
    assert len(page) == 1
    assert page[0]["id"] == 2

    with direct_vm.expect_revert("limit must be 1..100"):
        contract.list_cases(0, 0)


def test_withdraw_fees_only_by_recipient(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract = _deploy(direct_deploy)

    direct_vm.value = CTOR_MIN_FEE
    contract.file_case(
        "ProjectX", SAMPLE_RULE, SAMPLE_DECISION, SAMPLE_EVIDENCE
    )

    direct_vm.sender = direct_bob
    direct_vm.value = 0
    with direct_vm.expect_revert("only fee_recipient"):
        contract.withdraw_fees()
