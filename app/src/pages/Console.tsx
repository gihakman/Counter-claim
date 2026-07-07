import React, { useMemo, useState } from "react";
import type { WalletState } from "../lib/wallet";
import { makeWriteClient, CONTRACT_ADDRESS } from "../lib/client";
import { formatGen, type FeeConfig } from "../lib/contract";
import { TxStatusView } from "../components/TxStatus";
import { useTxStatus } from "../lib/tx";

interface ConsoleProps {
  wallet: WalletState;
  feeConfig: FeeConfig | null;
  onFiled: (hash: string, caseId?: number) => void;
}

export function ConsolePage({ wallet, feeConfig, onFiled }: ConsoleProps) {
  const [respondentLabel, setRespondentLabel] = useState(
    "Example Airdrop (Season 1)",
  );
  const [ruleText, setRuleText] = useState(SAMPLE_RULE);
  const [decisionChallenged, setDecisionChallenged] = useState(
    "0 tokens allocated, marked Sybil.",
  );
  const [evidenceText, setEvidenceText] = useState(SAMPLE_EVIDENCE);
  const [formError, setFormError] = useState<string | null>(null);
  const { status, runWrite } = useTxStatus();

  const minFeeWei = useMemo(() => {
    if (!feeConfig) return 0n;
    try {
      return BigInt(feeConfig.min_fee);
    } catch {
      return 0n;
    }
  }, [feeConfig]);

  const canSubmit =
    wallet.isConnected && wallet.onCorrectChain && !isInFlight(status.phase);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!wallet.provider || !wallet.address) {
      setFormError("Connect a wallet first.");
      return;
    }
    if (!wallet.onCorrectChain) {
      setFormError("Switch your wallet to the Bradbury testnet.");
      return;
    }
    if (!respondentLabel.trim() || !ruleText.trim() || !decisionChallenged.trim() || !evidenceText.trim()) {
      setFormError("Every field is required.");
      return;
    }
    if (ruleText.length > 20_000 || evidenceText.length > 20_000) {
      setFormError("Rule text and evidence text are capped at 20,000 characters each.");
      return;
    }
    if (respondentLabel.length > 200) {
      setFormError("Respondent label is capped at 200 characters.");
      return;
    }
    if (decisionChallenged.length > 500) {
      setFormError("Decision text is capped at 500 characters.");
      return;
    }

    const client: any = makeWriteClient(wallet.address, wallet.provider);
    const value = minFeeWei > 0n ? minFeeWei : 10n ** 16n;

    const hash = await runWrite(async () => {
      const h = (await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "file_case",
        args: [respondentLabel.trim(), ruleText, decisionChallenged.trim(), evidenceText],
        value,
      })) as string;
      return h;
    }, { label: "file_case" });

    if (hash) {
      onFiled(hash);
    }
  }

  return (
    <>
      <section className="section">
        <div className="container">
          <div className="section-num">Console · §01</div>
          <h1 className="section-title">File a case</h1>
          <p className="section-lede">
            Paste the published rule the algorithm was applying, describe the
            decision that was made against you, and lay out the evidence.
            Validators will read what you submit; be specific.
          </p>

          {!wallet.isConnected && (
            <div className="empty" style={{ marginTop: 32 }}>
              Connect a wallet to sign the filing transaction. The site does
              not hold any keys — signing happens in your wallet.
            </div>
          )}

          <form className="form" onSubmit={onSubmit} style={{ marginTop: 40 }}>
            <div className="field">
              <label htmlFor="respondent">Respondent label</label>
              <input
                id="respondent"
                type="text"
                value={respondentLabel}
                onChange={(e) => setRespondentLabel(e.target.value)}
                maxLength={200}
                placeholder="e.g. Uniswap UNI Airdrop (Sep 2020)"
              />
              <div className="hint">A short public name for the algorithm operator. Max 200 chars.</div>
            </div>

            <div className="field">
              <label htmlFor="rule">Published rule text</label>
              <textarea
                id="rule"
                rows={10}
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                maxLength={20_000}
              />
              <div className="hint">
                The eligibility criteria as published by the operator. Include the
                explicit ineligibility rules (X1, X2, ...). Max 20,000 chars.
              </div>
            </div>

            <div className="field">
              <label htmlFor="decision">Decision challenged</label>
              <input
                id="decision"
                type="text"
                value={decisionChallenged}
                onChange={(e) => setDecisionChallenged(e.target.value)}
                maxLength={500}
                placeholder='e.g. "0 tokens allocated, marked Sybil."'
              />
              <div className="hint">One sentence describing what the algorithm decided. Max 500 chars.</div>
            </div>

            <div className="field">
              <label htmlFor="evidence">Your evidence</label>
              <textarea
                id="evidence"
                rows={10}
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                maxLength={20_000}
              />
              <div className="hint">
                Which conditions you meet, which explicit ineligibilities do not
                apply to you, and any citations to on-chain history. Max 20,000 chars.
              </div>
            </div>

            <div className="form-actions">
              <button className="btn" type="submit" disabled={!canSubmit}>
                {isInFlight(status.phase)
                  ? "Filing..."
                  : `File case · ${formatGen(minFeeWei > 0n ? minFeeWei : 10n ** 16n)}`}
              </button>
              {feeConfig && (
                <span className="marginalia">
                  Minimum fee: {formatGen(feeConfig.min_fee)} · fee_bps ={" "}
                  {feeConfig.fee_bps}
                </span>
              )}
            </div>

            {formError && <div className="form-error">{formError}</div>}
          </form>

          <TxStatusView status={status} />

          {status.phase === "accepted" && (
            <div className="txstatus" style={{ marginTop: 12 }}>
              <div className="phase ok">
                Filed. Adjudicate the case next from the archive.
              </div>
            </div>
          )}
        </div>
      </section>
    </>
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

const SAMPLE_RULE = `Airdrop Eligibility Criteria (illustrative sample — replace with the real rule text you're challenging):

C1. The wallet made at least one transaction on the target chain before the snapshot block.
C2. The wallet is not on the published Sybil filter list.
C3. The wallet held at least $100 in bridged assets on the snapshot date.

Explicit ineligibility:
X1. Wallets flagged by the operator's Sybil clustering study.
X2. Wallets created after the snapshot block.
X3. Wallets that are smart contracts without an identifiable individual controller.
`;

const SAMPLE_EVIDENCE = `The petitioner's wallet 0xC0FFEE... satisfies C1 (34 transactions before snapshot), C2 (not on the published Sybil filter list), and C3 ($412 in bridged USDC on the snapshot date). None of X1, X2, or X3 applies. Replace this text with the specifics of your own case.`;
