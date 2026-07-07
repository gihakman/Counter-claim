import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { WalletState } from "../lib/wallet";
import type { CaseView } from "../lib/contract";
import { fetchCases, decisionClass, decisionLabel } from "../lib/contract";
import { CONTRACT_ADDRESS, makeWriteClient } from "../lib/client";
import { VerdictReceipt } from "../components/VerdictReceipt";
import { TxStatusView } from "../components/TxStatus";
import { useTxStatus } from "../lib/tx";

interface ArchiveProps {
  wallet: WalletState;
  refreshKey: number;
  onRefresh: () => void;
}

type ActionKind = "adjudicate" | "appeal";

export function Archive({ wallet, refreshKey, onRefresh }: ArchiveProps) {
  const [cases, setCases] = useState<CaseView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [activeAction, setActiveAction] = useState<{ kind: ActionKind; id: number } | null>(
    null,
  );
  const { status, runWrite, reset } = useTxStatus();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchCases(0, 100);
      // Show newest first
      list.sort((a, b) => b.id - a.id);
      setCases(list);
    } catch (err: any) {
      setError(err?.message ?? "failed to load cases");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  // After a successful adjudicate/appeal, re-fetch the case list.
  useEffect(() => {
    if (status.phase === "accepted" || status.phase === "finalized") {
      const t = setTimeout(() => {
        refresh();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [status.phase, refresh]);

  const openCase = useMemo(
    () => (openId != null ? cases?.find((c) => c.id === openId) ?? null : null),
    [cases, openId],
  );

  const canWrite =
    wallet.isConnected && wallet.onCorrectChain && !isInFlight(status.phase);

  const runAdjudicate = useCallback(
    async (id: number) => {
      if (!wallet.provider || !wallet.address) return;
      setActiveAction({ kind: "adjudicate", id });
      reset();
      const client: any = makeWriteClient(wallet.address, wallet.provider);
      await runWrite(
        async () =>
          (await client.writeContract({
            address: CONTRACT_ADDRESS,
            functionName: "adjudicate",
            args: [id],
          })) as string,
        { label: `adjudicate #${id}` },
      );
    },
    [wallet.provider, wallet.address, runWrite, reset],
  );

  const runAppeal = useCallback(
    async (id: number) => {
      if (!wallet.provider || !wallet.address) return;
      setActiveAction({ kind: "appeal", id });
      reset();
      const client: any = makeWriteClient(wallet.address, wallet.provider);
      await runWrite(
        async () =>
          (await client.writeContract({
            address: CONTRACT_ADDRESS,
            functionName: "appeal",
            args: [id],
          })) as string,
        { label: `appeal #${id}` },
      );
    },
    [wallet.provider, wallet.address, runWrite, reset],
  );

  return (
    <section className="section">
      <div className="container">
        <div className="section-num">Archive · §01</div>
        <h1 className="section-title">Verdict archive</h1>
        <p className="section-lede">
          Every case, filed and adjudicated on Bradbury, is listed below.
          Click a row to read the structured verdict. Anyone can trigger
          adjudication on a pending case; only the original petitioner can
          appeal.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 32 }}>
          <button className="btn small ghost" onClick={onRefresh}>
            Refresh
          </button>
          <span className="marginalia">
            Reading directly from{" "}
            <a
              href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              {CONTRACT_ADDRESS.slice(0, 10)}…{CONTRACT_ADDRESS.slice(-6)}
            </a>
          </span>
        </div>

        {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

        {cases === null && <div className="empty">Loading verdicts from the chain…</div>}

        {cases !== null && cases.length === 0 && (
          <div className="empty">
            No cases on this contract yet. Head to the console to file one.
          </div>
        )}

        {cases !== null && cases.length > 0 && (
          <div className="docket" style={{ marginTop: 32 }}>
            {cases.map((c) => (
              <button
                key={c.id}
                className="row"
                style={{
                  cursor: "pointer",
                  background: openId === c.id ? "var(--paper-2)" : "transparent",
                  border: 0,
                  borderTop: "1px solid var(--rule)",
                  width: "100%",
                  textAlign: "left",
                  fontFamily: "inherit",
                  color: "inherit",
                }}
                onClick={() => setOpenId(openId === c.id ? null : c.id)}
              >
                <div className="num">Case No. {String(c.id).padStart(3, "0")}</div>
                <div className="subject">
                  <div>{c.respondent_label || "Untitled respondent"}</div>
                  <p>{c.decision_challenged}</p>
                </div>
                <div className={`stamp ${decisionClass(c.verdict_decision)}`}>
                  {decisionLabel(c.verdict_decision)}
                </div>
              </button>
            ))}
          </div>
        )}

        {openCase && (
          <div style={{ marginTop: 40 }}>
            <VerdictReceipt
              caseView={openCase}
              onAppeal={
                wallet.isConnected &&
                wallet.address?.toLowerCase() === openCase.petitioner.toLowerCase() &&
                openCase.appeal_count === 0
                  ? () => runAppeal(openCase.id)
                  : undefined
              }
              appealDisabled={!canWrite}
              appealHint={
                wallet.isConnected
                  ? openCase.appeal_count > 0
                    ? "Appeal already used"
                    : openCase.petitioner.toLowerCase() !== wallet.address?.toLowerCase()
                    ? "Only the petitioner may appeal"
                    : null
                  : "Connect a wallet to appeal"
              }
            />

            <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {(openCase.status === "pending" || openCase.status === "appealed") &&
                wallet.isConnected && (
                  <button
                    className="btn"
                    onClick={() => runAdjudicate(openCase.id)}
                    disabled={!canWrite}
                  >
                    {openCase.status === "appealed"
                      ? "Re-adjudicate"
                      : "Run adjudication"}
                  </button>
                )}
              {!wallet.isConnected &&
                (openCase.status === "pending" || openCase.status === "appealed") && (
                  <div className="marginalia">
                    Connect a wallet to run adjudication.
                  </div>
                )}
            </div>

            <TxStatusView status={status} />
            {activeAction && status.phase === "idle" && null}
          </div>
        )}
      </div>
    </section>
  );
}

function isInFlight(phase: string): boolean {
  return [
    "waiting_signature",
    "submitted",
    "pending",
    "proposing",
    "committing",
    "revealing",
  ].includes(phase);
}
