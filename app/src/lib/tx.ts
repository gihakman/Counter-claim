import { useCallback, useEffect, useRef, useState } from "react";
import { makeReadClient } from "./client";
import { explorerTx } from "./config";

export type TxPhase =
  | "idle"
  | "waiting_signature"
  | "submitted"
  | "pending"
  | "proposing"
  | "committing"
  | "revealing"
  | "accepted"
  | "finalized"
  | "undetermined"
  | "error";

export interface TxStatus {
  phase: TxPhase;
  hash: string | null;
  explorerUrl: string | null;
  message: string | null;
  errorMessage: string | null;
  execution: string | null; // FINISHED_WITH_RETURN / FINISHED_WITH_ERROR / ...
}

const TERMINAL: TxPhase[] = ["accepted", "finalized", "undetermined", "error"];

const STATUS_TO_PHASE: Record<string, TxPhase> = {
  PENDING: "pending",
  PROPOSING: "proposing",
  COMMITTING: "committing",
  REVEALING: "revealing",
  ACCEPTED: "accepted",
  FINALIZED: "finalized",
  COMMITTED: "accepted",
  UNDETERMINED: "undetermined",
  CANCELED: "error",
};

const PHASE_TEXT: Record<TxPhase, string> = {
  idle: "",
  waiting_signature: "Waiting for wallet signature...",
  submitted: "Transaction submitted. Awaiting sequencer.",
  pending: "Pending in the queue.",
  proposing: "Leader proposing a result.",
  committing: "Validators committing their votes.",
  revealing: "Validators revealing their votes.",
  accepted: "Accepted by consensus.",
  finalized: "Finalized on-chain.",
  undetermined: "Consensus could not be reached.",
  error: "Transaction failed.",
};

export function useTxStatus() {
  const [status, setStatus] = useState<TxStatus>({
    phase: "idle",
    hash: null,
    explorerUrl: null,
    message: null,
    errorMessage: null,
    execution: null,
  });

  const cancelRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setStatus({
      phase: "idle",
      hash: null,
      explorerUrl: null,
      message: null,
      errorMessage: null,
      execution: null,
    });
  }, []);

  const startPolling = useCallback(async (hash: string) => {
    cancelRef.current = false;
    const client: any = makeReadClient();
    const url = explorerTx(hash);
    setStatus({
      phase: "submitted",
      hash,
      explorerUrl: url,
      message: PHASE_TEXT.submitted,
      errorMessage: null,
      execution: null,
    });

    for (let attempt = 0; attempt < 400; attempt++) {
      if (cancelRef.current) return;
      try {
        const tx = await client.getTransaction({ hash });
        const statusName = String(tx?.statusName ?? "");
        const phase = STATUS_TO_PHASE[statusName] ?? "pending";
        const execution = tx?.txExecutionResultName ?? null;
        setStatus((s) => ({
          ...s,
          phase,
          message: PHASE_TEXT[phase],
          execution,
        }));
        if (TERMINAL.includes(phase)) return;
      } catch {
        // transient — keep polling
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    setStatus((s) => ({
      ...s,
      phase: "undetermined",
      message: "Timed out waiting for a decision. Check the explorer.",
    }));
  }, []);

  const runWrite = useCallback(
    async (
      op: () => Promise<string>,
      _opts?: { label?: string },
    ): Promise<string | null> => {
      cancelRef.current = false;
      setStatus({
        phase: "waiting_signature",
        hash: null,
        explorerUrl: null,
        message: PHASE_TEXT.waiting_signature,
        errorMessage: null,
        execution: null,
      });
      try {
        const hash = await op();
        await startPolling(hash);
        return hash;
      } catch (err: any) {
        const raw = String(err?.shortMessage ?? err?.message ?? err);
        // 4001 or "User rejected" — surface something calm rather than raw ABI dump.
        const isRejection = /reject|denied|4001/i.test(raw);
        setStatus({
          phase: "error",
          hash: null,
          explorerUrl: null,
          message: null,
          errorMessage: isRejection ? "Signature rejected in wallet." : raw,
          execution: null,
        });
        return null;
      }
    },
    [startPolling],
  );

  return { status, runWrite, reset };
}
