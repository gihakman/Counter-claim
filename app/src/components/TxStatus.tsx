import React from "react";
import type { TxStatus } from "../lib/tx";

const IN_FLIGHT: TxStatus["phase"][] = [
  "waiting_signature",
  "submitted",
  "pending",
  "proposing",
  "committing",
  "revealing",
];

export function TxStatusView({ status }: { status: TxStatus }) {
  if (status.phase === "idle") return null;

  const inFlight = IN_FLIGHT.includes(status.phase);
  const isError = status.phase === "error" || status.phase === "undetermined";
  const isOk = status.phase === "accepted" || status.phase === "finalized";

  return (
    <div className="txstatus" role="status" aria-live="polite">
      <div className="phase">
        {inFlight && <span className="spinner" aria-hidden="true" />}
        <span className={isOk ? "ok" : isError ? "err" : ""}>
          {phaseLabel(status.phase)}
        </span>
      </div>
      {status.message && !isError && (
        <div style={{ color: "var(--ink-3)" }}>{status.message}</div>
      )}
      {status.execution && (
        <div style={{ color: "var(--ink-3)" }}>
          Execution: <span style={{ color: "var(--ink)" }}>{status.execution}</span>
        </div>
      )}
      {status.errorMessage && (
        <div style={{ color: "var(--seal)" }}>{status.errorMessage}</div>
      )}
      {status.hash && status.explorerUrl && (
        <div>
          <a href={status.explorerUrl} target="_blank" rel="noreferrer">
            View on Bradbury explorer &rarr;
          </a>
        </div>
      )}
    </div>
  );
}

function phaseLabel(phase: TxStatus["phase"]): string {
  switch (phase) {
    case "waiting_signature":
      return "Awaiting signature";
    case "submitted":
      return "Submitted";
    case "pending":
      return "Pending in queue";
    case "proposing":
      return "Leader proposing";
    case "committing":
      return "Validators committing";
    case "revealing":
      return "Validators revealing";
    case "accepted":
      return "Accepted";
    case "finalized":
      return "Finalized";
    case "undetermined":
      return "Undetermined";
    case "error":
      return "Failed";
    default:
      return "";
  }
}
