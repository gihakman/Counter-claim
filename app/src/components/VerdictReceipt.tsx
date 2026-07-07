import React from "react";
import type { CaseView } from "../lib/contract";
import {
  decisionClass,
  decisionLabel,
  formatGen,
  shortAddr,
} from "../lib/contract";

interface VerdictReceiptProps {
  caseView: CaseView;
  onAppeal?: () => void;
  appealDisabled?: boolean;
  appealHint?: string | null;
}

export function VerdictReceipt({
  caseView: c,
  onAppeal,
  appealDisabled,
  appealHint,
}: VerdictReceiptProps) {
  const cls = decisionClass(c.verdict_decision);
  return (
    <article className="receipt" aria-labelledby={`case-${c.id}-title`}>
      <header className="h">
        <div>
          <div className="smallcaps">Docket &nbsp;•&nbsp; Case No. {c.id}</div>
          <h2 id={`case-${c.id}-title`} className="title">
            {c.respondent_label || "Untitled respondent"}
          </h2>
        </div>
        <div className={`seal ${cls}`}>{decisionLabel(c.verdict_decision)}</div>
      </header>

      <dl>
        <dt>Petitioner</dt>
        <dd className="mono">{shortAddr(c.petitioner, 8, 6)}</dd>

        <dt>Fee paid</dt>
        <dd className="mono">{formatGen(c.fee_paid)}</dd>

        <dt>Rule source</dt>
        <dd className="mono">{c.rule_source || "inline"}</dd>

        <dt>Decision challenged</dt>
        <dd>{c.decision_challenged}</dd>

        <dt>Confidence</dt>
        <dd className="mono">{(c.verdict_confidence || "n/a").toUpperCase()}</dd>

        <dt>Status</dt>
        <dd className="mono">
          {c.status.toUpperCase()}
          {c.appeal_count > 0 ? ` · ${c.appeal_count} appeal${c.appeal_count > 1 ? "s" : ""}` : ""}
        </dd>
      </dl>

      {c.verdict_rationale && (
        <blockquote className="rationale">{c.verdict_rationale}</blockquote>
      )}

      {c.findings.length > 0 && (
        <ol className="findings">
          {c.findings.map((f) => (
            <li key={`${c.id}-${f.condition_id}`}>
              <span className="cid">{f.condition_id}</span>
              <div className="body">
                {f.description}
                <div className="marginalia" style={{ marginTop: 4 }}>
                  Confidence: {f.confidence.toUpperCase()}
                </div>
              </div>
              <span className={`status ${f.met ? "met" : "unmet"}`}>
                {f.met ? "MET" : "UNMET"}
              </span>
            </li>
          ))}
        </ol>
      )}

      {onAppeal && c.status === "adjudicated" && (
        <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
          <button
            className="btn small danger"
            onClick={onAppeal}
            disabled={appealDisabled}
          >
            File appeal
          </button>
          {appealHint && <span className="marginalia">{appealHint}</span>}
        </div>
      )}
    </article>
  );
}
