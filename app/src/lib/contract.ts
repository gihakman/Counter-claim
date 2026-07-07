import { CONTRACT_ADDRESS, makeReadClient } from "./client";

export type Decision = "in_policy" | "out_of_policy" | "insufficient_evidence" | "";

export interface Finding {
  condition_id: string;
  description: string;
  met: boolean;
  confidence: "low" | "med" | "high";
}

export interface CaseView {
  id: number;
  petitioner: string;
  respondent_label: string;
  rule_source: string;
  rule_text: string;
  decision_challenged: string;
  evidence_text: string;
  fee_paid: string;
  status: "pending" | "adjudicated" | "appealed" | "final" | string;
  verdict_decision: Decision;
  verdict_confidence: "low" | "med" | "high" | "";
  verdict_rationale: string;
  findings: Finding[];
  appeal_count: number;
}

export interface FeeConfig {
  min_fee: string; // wei
  fee_bps: number;
  fee_recipient: string;
  owner: string;
  fees_accrued: string;
}

async function withRetry<T>(fn: () => Promise<T>, label = "call"): Promise<T> {
  const delays = [0, 1500, 4000];
  let lastErr: unknown;
  for (const d of delays) {
    if (d > 0) await new Promise((r) => setTimeout(r, d));
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Retry only if it looks like a transient RPC error
      const msg = String((err as any)?.message ?? err);
      if (!/(429|timeout|Failed|fetch|ECONN|network)/i.test(msg)) throw err;
      console.warn(`${label}: retry after transient (${msg.slice(0, 80)})`);
    }
  }
  throw lastErr;
}

export async function fetchTotalCases(): Promise<number> {
  const client: any = makeReadClient();
  const res = (await withRetry(
    () =>
      client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "total_cases",
        args: [],
      }),
    "total_cases",
  )) as any;
  return typeof res === "bigint" ? Number(res) : Number(res ?? 0);
}

export async function fetchFeeConfig(): Promise<FeeConfig> {
  const client: any = makeReadClient();
  const res = (await withRetry(
    () =>
      client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "fee_config",
        args: [],
      }),
    "fee_config",
  )) as any;
  return normalizeFeeConfig(res);
}

export async function fetchCase(id: number): Promise<CaseView> {
  const client: any = makeReadClient();
  const res = (await withRetry(
    () =>
      client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_case",
        args: [id],
      }),
    `get_case(${id})`,
  )) as any;
  return normalizeCase(res);
}

export async function fetchCases(offset = 0, limit = 100): Promise<CaseView[]> {
  const client: any = makeReadClient();
  const res = (await withRetry(
    () =>
      client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "list_cases",
        args: [offset, limit],
      }),
    "list_cases",
  )) as any[];
  return (res ?? []).map(normalizeCase);
}

function normalizeCase(raw: any): CaseView {
  return {
    id: Number(raw.id ?? 0),
    petitioner: String(raw.petitioner ?? ""),
    respondent_label: String(raw.respondent_label ?? ""),
    rule_source: String(raw.rule_source ?? ""),
    rule_text: String(raw.rule_text ?? ""),
    decision_challenged: String(raw.decision_challenged ?? ""),
    evidence_text: String(raw.evidence_text ?? ""),
    fee_paid: String(raw.fee_paid ?? "0"),
    status: String(raw.status ?? "pending"),
    verdict_decision: (raw.verdict_decision ?? "") as Decision,
    verdict_confidence: (raw.verdict_confidence ?? "") as CaseView["verdict_confidence"],
    verdict_rationale: String(raw.verdict_rationale ?? ""),
    findings: Array.isArray(raw.findings)
      ? raw.findings.map((f: any) => ({
          condition_id: String(f.condition_id ?? ""),
          description: String(f.description ?? ""),
          met: Boolean(f.met),
          confidence: String(f.confidence ?? "med") as Finding["confidence"],
        }))
      : [],
    appeal_count: Number(raw.appeal_count ?? 0),
  };
}

function normalizeFeeConfig(raw: any): FeeConfig {
  return {
    min_fee: String(raw.min_fee ?? "0"),
    fee_bps: Number(raw.fee_bps ?? 0),
    fee_recipient: String(raw.fee_recipient ?? ""),
    owner: String(raw.owner ?? ""),
    fees_accrued: String(raw.fees_accrued ?? "0"),
  };
}

/**
 * Wei -> "0.01 GEN" style label (up to 4 decimals of precision).
 */
export function formatGen(wei: string | number | bigint): string {
  const w = typeof wei === "bigint" ? wei : BigInt(String(wei));
  const whole = w / 10n ** 18n;
  const frac = w % 10n ** 18n;
  const fracStr = (frac + 10n ** 18n).toString().slice(1, 5); // first 4 digits after "1"
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed ? `${whole.toString()}.${trimmed} GEN` : `${whole.toString()} GEN`;
}

export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

export function decisionLabel(d: Decision): string {
  switch (d) {
    case "in_policy":
      return "IN POLICY";
    case "out_of_policy":
      return "OUT OF POLICY";
    case "insufficient_evidence":
      return "INSUFFICIENT EVIDENCE";
    default:
      return "PENDING";
  }
}

export function decisionClass(d: Decision): "in" | "out" | "insuff" | "pending" {
  switch (d) {
    case "in_policy":
      return "in";
    case "out_of_policy":
      return "out";
    case "insufficient_evidence":
      return "insuff";
    default:
      return "pending";
  }
}
