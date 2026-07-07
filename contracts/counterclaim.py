# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# Counterclaim — validator-issued verdict layer on GenLayer.
# One person submits an algorithmic decision and its published rule;
# validators independently reason about whether the algorithm followed
# its own rule and return a structured, appealable verdict.

import json
from dataclasses import dataclass
from genlayer import *


# ---------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------

STATUS_PENDING = "pending"
STATUS_ADJUDICATED = "adjudicated"
STATUS_APPEALED = "appealed"
STATUS_FINAL = "final"

DECISION_IN_POLICY = "in_policy"
DECISION_OUT_OF_POLICY = "out_of_policy"
DECISION_INSUFFICIENT = "insufficient_evidence"

CONFIDENCE_LOW = "low"
CONFIDENCE_MED = "med"
CONFIDENCE_HIGH = "high"

MAX_APPEALS = 1

# Rule and evidence text are stored on-chain, so we cap their size to keep
# storage costs bounded and prevent adversarial payload injection.
MAX_RULE_TEXT_LEN = 20_000
MAX_EVIDENCE_LEN = 20_000
MAX_LABEL_LEN = 200
MAX_DECISION_LEN = 500

# Allowed rule-source TLDs when the petitioner supplies a URL.
ALLOWED_TLDS = (".com", ".org", ".io")


# ---------------------------------------------------------------------
# Stored types
# ---------------------------------------------------------------------


@allow_storage
@dataclass
class Finding:
    """A validator-agreed finding on a single condition of the published rule."""

    condition_id: str
    description: str
    met: bool
    confidence: str


@allow_storage
@dataclass
class Case:
    """A single Counterclaim case — one algorithmic decision under review."""

    id: u256
    petitioner: Address
    respondent_label: str
    rule_source: str           # a URL when supplied, otherwise "inline"
    rule_text: str             # normalized rule snapshot stored on-chain
    decision_challenged: str
    evidence_text: str
    fee_paid: u256
    status: str
    verdict_decision: str
    verdict_confidence: str
    verdict_rationale: str
    findings_json: str         # JSON-encoded list[Finding] for storage simplicity
    appeal_count: u256


# ---------------------------------------------------------------------
# Adjudication prompt
# ---------------------------------------------------------------------


ADJUDICATION_TASK = """You are one validator on a decentralised adjudication network.

Your task: decide whether an algorithm followed its own published rule when it
issued a decision against a specific petitioner. You must reason from the
supplied rule text and evidence text only. Do not invent facts.

Return a JSON object with EXACTLY these keys and no other text:
{
  "decision": "in_policy" | "out_of_policy" | "insufficient_evidence",
  "confidence": "low" | "med" | "high",
  "findings": [
    {
      "condition_id": "C1",
      "description": "short human phrase for the condition",
      "met": true | false,
      "confidence": "low" | "med" | "high"
    }
    // ... one finding per material condition of the rule
  ],
  "rationale": "one paragraph in plain English"
}

Rules for the verdict:
- "out_of_policy" means the algorithm's decision violated at least one
  condition that the petitioner clearly meets.
- "in_policy" means the evidence supports every condition the algorithm's
  decision requires.
- "insufficient_evidence" means the rule or evidence is too ambiguous or
  incomplete to reach a confident finding.
- Every material condition of the rule must appear in "findings" with a
  stable "condition_id" of the form "C1", "C2", "C3" ...
- Keep "description" short (under 20 words). Keep "rationale" under 120 words.
- Do not include any commentary before or after the JSON object.
"""


EQ_CRITERIA = """The output must be a JSON object with exactly these top-level keys:
`decision`, `confidence`, `findings`, `rationale`. No other keys, no
surrounding text, no markdown fences.

- `decision` MUST be one of: "in_policy", "out_of_policy", "insufficient_evidence".
- `confidence` MUST be one of: "low", "med", "high".
- `findings` MUST be a non-empty list. Each entry MUST have these keys and only these:
  `condition_id` (short string like "C1"), `description` (short human phrase),
  `met` (a boolean), `confidence` (one of "low"/"med"/"high").
- `rationale` MUST be a plain English paragraph, one paragraph, under 120 words,
  that is faithful to the supplied rule text and evidence and does not invent facts.
- The verdict must be defensible from the rule and evidence provided. In particular:
    * If the evidence clearly satisfies every material condition of the rule and
      the algorithm's decision denies the petitioner anyway, `decision` MUST be
      "out_of_policy".
    * If the evidence clearly fails at least one material condition, `decision`
      MUST be "in_policy" (the algorithm followed the rule).
    * If either the rule or the evidence is materially ambiguous or missing
      information, `decision` MUST be "insufficient_evidence".
- Reject the output if any of the required keys are missing, if `decision` is
  not one of the allowed values, if `findings` is empty, if any finding is
  missing a boolean `met`, or if the rationale contradicts the rule or evidence.
"""


# ---------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------


class Counterclaim(gl.Contract):
    """Public, validator-issued verdicts on algorithmic decisions."""

    # --- config ---
    owner: Address
    fee_recipient: Address
    fee_bps: u256              # basis points routed to fee_recipient on withdraw
    min_fee: u256              # minimum petition fee in wei

    # --- state ---
    case_count: u256
    cases: TreeMap[u256, Case]
    case_ids: DynArray[u256]
    fees_accrued: u256         # total fees held in the contract

    def __init__(self, min_fee: int, fee_recipient: str, fee_bps: int) -> None:
        self.owner = gl.message.sender_address
        self.fee_recipient = (
            Address(fee_recipient) if fee_recipient else gl.message.sender_address
        )
        self.fee_bps = u256(fee_bps)
        self.min_fee = u256(min_fee)
        self.case_count = u256(0)
        self.fees_accrued = u256(0)

    # --- internal helpers ---

    def _require(self, condition: bool, message: str) -> None:
        if not condition:
            raise gl.vm.UserError(message)

    def _validate_lengths(
        self,
        respondent_label: str,
        rule_text: str,
        decision_challenged: str,
        evidence_text: str,
    ) -> None:
        self._require(
            0 < len(respondent_label) <= MAX_LABEL_LEN,
            f"respondent_label length must be 1..{MAX_LABEL_LEN}",
        )
        self._require(
            0 < len(rule_text) <= MAX_RULE_TEXT_LEN,
            f"rule_text length must be 1..{MAX_RULE_TEXT_LEN}",
        )
        self._require(
            0 < len(decision_challenged) <= MAX_DECISION_LEN,
            f"decision_challenged length must be 1..{MAX_DECISION_LEN}",
        )
        self._require(
            0 < len(evidence_text) <= MAX_EVIDENCE_LEN,
            f"evidence_text length must be 1..{MAX_EVIDENCE_LEN}",
        )

    def _validate_url_tld(self, url: str) -> None:
        low = url.lower()
        self._require(
            low.startswith("http://") or low.startswith("https://"),
            "rule_source URL must be http(s)",
        )
        # Extract host by trimming scheme and everything after the first "/".
        host = low.split("://", 1)[1].split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
        # Strip a possible ":port" suffix.
        host = host.split(":", 1)[0]
        matched = False
        for tld in ALLOWED_TLDS:
            if host.endswith(tld):
                matched = True
                break
        self._require(
            matched,
            "rule_source host must end with a common TLD (.com/.org/.io)",
        )

    # --- writes ---

    @gl.public.write.payable
    def file_case(
        self,
        respondent_label: str,
        rule_text: str,
        decision_challenged: str,
        evidence_text: str,
    ) -> int:
        """File a case with an inline rule snapshot. Payable; requires >= min_fee."""
        self._validate_lengths(
            respondent_label, rule_text, decision_challenged, evidence_text
        )
        self._require(
            gl.message.value >= self.min_fee,
            "petition fee below min_fee",
        )
        return self._store_case(
            respondent_label=respondent_label,
            rule_source="inline",
            rule_text=rule_text,
            decision_challenged=decision_challenged,
            evidence_text=evidence_text,
        )

    @gl.public.write.payable
    def file_case_from_url(
        self,
        respondent_label: str,
        rule_source_url: str,
        decision_challenged: str,
        evidence_text: str,
    ) -> int:
        """File a case that fetches the rule from a URL on a common TLD.

        Petitioners can defer rule capture to the network. The URL is
        validated for TLD; the fetched text is normalized and snapshotted
        into `rule_text`.
        """
        self._validate_url_tld(rule_source_url)
        self._require(
            0 < len(respondent_label) <= MAX_LABEL_LEN,
            f"respondent_label length must be 1..{MAX_LABEL_LEN}",
        )
        self._require(
            0 < len(decision_challenged) <= MAX_DECISION_LEN,
            f"decision_challenged length must be 1..{MAX_DECISION_LEN}",
        )
        self._require(
            0 < len(evidence_text) <= MAX_EVIDENCE_LEN,
            f"evidence_text length must be 1..{MAX_EVIDENCE_LEN}",
        )
        self._require(
            gl.message.value >= self.min_fee,
            "petition fee below min_fee",
        )

        def fetch_and_normalize() -> str:
            web = gl.nondet.web.get(rule_source_url)
            body = web.body.decode("utf-8", errors="replace")
            # Trim to on-chain cap and collapse egregious whitespace runs.
            trimmed = " ".join(body.split())
            if len(trimmed) > MAX_RULE_TEXT_LEN:
                trimmed = trimmed[:MAX_RULE_TEXT_LEN]
            return trimmed

        rule_text = gl.eq_principle.strict_eq(fetch_and_normalize)

        self._require(
            len(rule_text) > 0, "fetched rule_text is empty"
        )

        return self._store_case(
            respondent_label=respondent_label,
            rule_source=rule_source_url,
            rule_text=rule_text,
            decision_challenged=decision_challenged,
            evidence_text=evidence_text,
        )

    def _store_case(
        self,
        respondent_label: str,
        rule_source: str,
        rule_text: str,
        decision_challenged: str,
        evidence_text: str,
    ) -> int:
        self.case_count = self.case_count + u256(1)
        case_id = self.case_count
        fee = gl.message.value
        self.fees_accrued = self.fees_accrued + fee

        case = Case(
            id=case_id,
            petitioner=gl.message.sender_address,
            respondent_label=respondent_label,
            rule_source=rule_source,
            rule_text=rule_text,
            decision_challenged=decision_challenged,
            evidence_text=evidence_text,
            fee_paid=fee,
            status=STATUS_PENDING,
            verdict_decision="",
            verdict_confidence="",
            verdict_rationale="",
            findings_json="",
            appeal_count=u256(0),
        )
        self.cases[case_id] = case
        self.case_ids.append(case_id)
        return int(case_id)

    @gl.public.write
    def adjudicate(self, case_id: int) -> None:
        """Run the verdict round on a pending or appealed case.

        The heavy work runs inside a single equivalence block so validators
        independently produce the entire structured verdict. Storage writes
        happen after consensus, in the deterministic tail below.
        """
        cid = u256(case_id)
        self._require(cid in self.cases, "case not found")
        case = self.cases[cid]
        self._require(
            case.status in (STATUS_PENDING, STATUS_APPEALED),
            f"case is not adjudicable (status={case.status})",
        )

        rule_text = case.rule_text
        decision_challenged = case.decision_challenged
        evidence_text = case.evidence_text
        respondent_label = case.respondent_label

        def render_input() -> str:
            # This function runs on both leader and validator inside the eq
            # block. It returns the exact input string the leader must reason
            # over. Do not include any consensus-sensitive external calls here.
            return (
                f"--- Respondent (algorithm operator) ---\n{respondent_label}\n\n"
                f"--- Algorithm's decision against the petitioner ---\n"
                f"{decision_challenged}\n\n"
                f"--- Published rule text ---\n{rule_text}\n\n"
                f"--- Petitioner's evidence ---\n{evidence_text}\n"
            )

        raw = gl.eq_principle.prompt_non_comparative(
            render_input,
            task=ADJUDICATION_TASK,
            criteria=EQ_CRITERIA,
        )

        # The framework returns the leader's raw output as a string; strip any
        # code-fence wrapper defensively and parse JSON.
        if isinstance(raw, dict):
            verdict = raw
        else:
            text = str(raw)
            cleaned = text.replace("```json", "").replace("```", "").strip()
            # Locate the first JSON object if the model added preamble text.
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise gl.vm.UserError("adjudicator did not return a JSON object")
            verdict = json.loads(cleaned[start : end + 1])

        # ---- deterministic tail (post-consensus) ----
        decision = str(verdict.get("decision", "")).strip()
        confidence = str(verdict.get("confidence", "")).strip()
        rationale = str(verdict.get("rationale", "")).strip()
        raw_findings = verdict.get("findings", [])

        self._require(
            decision in (DECISION_IN_POLICY, DECISION_OUT_OF_POLICY, DECISION_INSUFFICIENT),
            f"verdict decision invalid: {decision}",
        )
        self._require(
            confidence in (CONFIDENCE_LOW, CONFIDENCE_MED, CONFIDENCE_HIGH),
            f"verdict confidence invalid: {confidence}",
        )
        self._require(
            isinstance(raw_findings, list) and len(raw_findings) > 0,
            "verdict must include at least one finding",
        )

        findings: list[dict] = []
        for idx, f in enumerate(raw_findings):
            if not isinstance(f, dict):
                raise gl.vm.UserError(f"finding {idx} is not a dict")
            cid_str = str(f.get("condition_id", "")).strip()
            desc = str(f.get("description", "")).strip()
            met_raw = f.get("met")
            conf = str(f.get("confidence", "")).strip()
            if not cid_str:
                raise gl.vm.UserError(f"finding {idx} missing condition_id")
            if conf not in (CONFIDENCE_LOW, CONFIDENCE_MED, CONFIDENCE_HIGH):
                raise gl.vm.UserError(f"finding {idx} confidence invalid: {conf}")
            if not isinstance(met_raw, bool):
                raise gl.vm.UserError(f"finding {idx} met must be bool")
            findings.append(
                {
                    "condition_id": cid_str,
                    "description": desc[:280],
                    "met": met_raw,
                    "confidence": conf,
                }
            )

        case.verdict_decision = decision
        case.verdict_confidence = confidence
        case.verdict_rationale = rationale[:1200]
        case.findings_json = json.dumps(findings, ensure_ascii=False)
        case.status = (
            STATUS_FINAL if case.appeal_count >= u256(MAX_APPEALS) else STATUS_ADJUDICATED
        )

    @gl.public.write
    def appeal(self, case_id: int) -> None:
        """Petitioner-only single-shot appeal. Requeues the case for re-adjudication."""
        cid = u256(case_id)
        self._require(cid in self.cases, "case not found")
        case = self.cases[cid]
        self._require(
            gl.message.sender_address == case.petitioner,
            "only petitioner may appeal",
        )
        self._require(
            case.status == STATUS_ADJUDICATED,
            f"case is not appealable (status={case.status})",
        )
        self._require(
            case.appeal_count < u256(MAX_APPEALS),
            "appeal limit reached",
        )
        case.appeal_count = case.appeal_count + u256(1)
        case.status = STATUS_APPEALED

    @gl.public.write
    def withdraw_fees(self) -> None:
        """Route accrued fees to fee_recipient (fee_bps of the balance).

        Kept intentionally simple: the caller must be the fee_recipient. The
        contract sweeps `fees_accrued * fee_bps / 10000` to `fee_recipient`
        and resets the accrual counter.
        """
        self._require(
            gl.message.sender_address == self.fee_recipient,
            "only fee_recipient may withdraw",
        )
        payable = self.fees_accrued * self.fee_bps // u256(10000)
        self._require(payable > u256(0), "no fees available")
        self.fees_accrued = self.fees_accrued - payable
        gl.message.send(self.fee_recipient, payable)

    # --- views ---

    @gl.public.view
    def total_cases(self) -> int:
        return int(self.case_count)

    @gl.public.view
    def fee_config(self) -> dict:
        return {
            "min_fee": str(int(self.min_fee)),
            "fee_bps": int(self.fee_bps),
            "fee_recipient": self.fee_recipient.as_hex,
            "owner": self.owner.as_hex,
            "fees_accrued": str(int(self.fees_accrued)),
        }

    @gl.public.view
    def get_case(self, case_id: int) -> dict:
        cid = u256(case_id)
        if cid not in self.cases:
            raise gl.vm.UserError("case not found")
        return self._case_to_dict(self.cases[cid])

    @gl.public.view
    def list_cases(self, offset: int, limit: int) -> list:
        self._require(offset >= 0, "offset must be >= 0")
        self._require(0 < limit <= 100, "limit must be 1..100")
        total = len(self.case_ids)
        end = min(total, offset + limit)
        out = []
        for i in range(offset, end):
            cid = self.case_ids[i]
            out.append(self._case_to_dict(self.cases[cid]))
        return out

    def _case_to_dict(self, case: Case) -> dict:
        return {
            "id": int(case.id),
            "petitioner": case.petitioner.as_hex,
            "respondent_label": case.respondent_label,
            "rule_source": case.rule_source,
            "rule_text": case.rule_text,
            "decision_challenged": case.decision_challenged,
            "evidence_text": case.evidence_text,
            "fee_paid": str(int(case.fee_paid)),
            "status": case.status,
            "verdict_decision": case.verdict_decision,
            "verdict_confidence": case.verdict_confidence,
            "verdict_rationale": case.verdict_rationale,
            "findings": (
                json.loads(case.findings_json) if case.findings_json else []
            ),
            "appeal_count": int(case.appeal_count),
        }
