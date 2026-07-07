import React from "react";
import { CONTRACT_ADDRESS } from "../lib/client";
import { explorerAddress, BRADBURY_EXPLORER } from "../lib/config";
import { GitHubLink } from "../components/GitHubLink";

interface DocsProps {
  onFileCase: () => void;
  onViewArchive: () => void;
  cases: number | null;
}

export function Docs({ onFileCase, onViewArchive, cases }: DocsProps) {
  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="hero">
        <div className="container">
          <div className="marginalia" style={{ marginBottom: 16 }}>
            § 00 &nbsp;·&nbsp; Docket opens
          </div>
          <h1 className="title">
            A record for when an <em>algorithm</em> did not follow its own rule.
          </h1>
          <p className="lede">
            Counterclaim files, adjudicates, and publishes structured verdicts
            on algorithmic decisions. Every verdict is produced by independent
            validators on GenLayer, is appealable under Optimistic Democracy,
            and is written to the chain — not to a vendor's dashboard.
          </p>

          <div className="cta">
            <button className="btn" onClick={onFileCase}>
              File a case →
            </button>
            <button className="btn ghost" onClick={onViewArchive}>
              Browse the verdict archive
            </button>
            <GitHubLink variant="text" size={18} className="hero-source" />
          </div>

          <div className="meta">
            <div>
              <div>Network</div>
              <strong>GenLayer Bradbury</strong>
            </div>
            <div>
              <div>Contract</div>
              <strong className="mono">
                <a
                  href={explorerAddress(CONTRACT_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {CONTRACT_ADDRESS.slice(0, 10)}…{CONTRACT_ADDRESS.slice(-6)}
                </a>
              </strong>
            </div>
            <div>
              <div>Verdicts on record</div>
              <strong>{cases ?? "—"}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Section 01 — What Counterclaim is -------------------------------- */}
      <section className="section">
        <div className="container grid side">
          <div>
            <div className="section-num">§ 01</div>
            <h2 className="section-title">What it is</h2>
          </div>
          <div>
            <p className="section-lede">
              A validator-issued verdict service. You submit an algorithmic
              decision, the published rule the decision was made under, and
              your evidence. A pool of independent validators reads the same
              rule, reads your evidence, and reasons about whether the rule
              was followed. Their agreed verdict is written on-chain with
              per-condition findings and confidence.
            </p>
            <p className="section-lede" style={{ marginTop: 16 }}>
              Beachhead: airdrop-eligibility disputes. The mechanism is
              general: any decision made under a published rule can be filed.
            </p>
          </div>
        </div>
      </section>

      {/* Section 02 — Why GenLayer ---------------------------------------- */}
      <section className="section">
        <div className="container grid side">
          <div>
            <div className="section-num">§ 02</div>
            <h2 className="section-title">Why on GenLayer</h2>
          </div>
          <div>
            <p className="section-lede">
              A verdict is only worth what its neutrality is worth. A single
              vendor's LLM can be captured. A single arbitrator can be biased.
              A deterministic engine cannot interpret natural-language rules.
              GenLayer is the only place where multiple validators
              independently reason about a decision, reach structured
              consensus, and produce a verdict nobody owns.
            </p>
          </div>
        </div>
      </section>

      {/* Section 03 — How it works ---------------------------------------- */}
      <section className="section">
        <div className="container">
          <div className="section-num">§ 03</div>
          <h2 className="section-title">How a case moves through the docket</h2>
          <div className="grid three" style={{ marginTop: 40 }}>
            <div>
              <div className="smallcaps">Step 01 · File</div>
              <h3 style={{ marginTop: 8, fontFamily: "var(--serif-display)" }}>
                Submit the rule and the evidence
              </h3>
              <p>
                Paste the eligibility rule text, the decision that was made
                against you, and your evidence. Pay the filing fee. Your case
                receives a docket number.
              </p>
            </div>
            <div>
              <div className="smallcaps">Step 02 · Adjudicate</div>
              <h3 style={{ marginTop: 8, fontFamily: "var(--serif-display)" }}>
                Validators reason about the rule
              </h3>
              <p>
                Independent validators read the same rule and evidence. Each
                validator judges whether the algorithm's decision is
                defensible under the rule. Consensus produces the verdict.
              </p>
            </div>
            <div>
              <div className="smallcaps">Step 03 · Publish</div>
              <h3 style={{ marginTop: 8, fontFamily: "var(--serif-display)" }}>
                The verdict is a public record
              </h3>
              <p>
                Decision, confidence, per-condition findings, and a rationale
                paragraph are written to the contract. Petitioners may appeal
                once. Anyone can read the record on-chain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 04 — Contract surface ----------------------------------- */}
      <section className="section">
        <div className="container">
          <div className="section-num">§ 04</div>
          <h2 className="section-title">Contract surface</h2>
          <p className="section-lede">
            The Counterclaim intelligent contract exposes five writes and four
            views. Every method is documented below with its runtime cost
            surface. Full ABI schema is generated from the contract source
            and published alongside the code.
          </p>

          <table className="docs" style={{ marginTop: 32 }}>
            <thead>
              <tr>
                <th>Method</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Payable</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono">file_case(respondent, rule, decision, evidence)</td>
                <td>write</td>
                <td>Open a docket with an inline rule snapshot.</td>
                <td>yes</td>
              </tr>
              <tr>
                <td className="mono">file_case_from_url(respondent, url, decision, evidence)</td>
                <td>write</td>
                <td>Open a docket whose rule text is fetched by validators from a .com/.org/.io URL.</td>
                <td>yes</td>
              </tr>
              <tr>
                <td className="mono">adjudicate(case_id)</td>
                <td>write</td>
                <td>Run the verdict round. Validators independently reason about the rule and evidence.</td>
                <td>no</td>
              </tr>
              <tr>
                <td className="mono">appeal(case_id)</td>
                <td>write</td>
                <td>Petitioner-only single-shot appeal. Requeues the case for re-adjudication.</td>
                <td>no</td>
              </tr>
              <tr>
                <td className="mono">withdraw_fees()</td>
                <td>write</td>
                <td>Fee recipient sweeps accrued fees per fee_bps.</td>
                <td>no</td>
              </tr>
              <tr>
                <td className="mono">get_case(id)</td>
                <td>view</td>
                <td>Return a case and its verdict as a structured record.</td>
                <td>—</td>
              </tr>
              <tr>
                <td className="mono">list_cases(offset, limit)</td>
                <td>view</td>
                <td>Paginated docket listing.</td>
                <td>—</td>
              </tr>
              <tr>
                <td className="mono">total_cases()</td>
                <td>view</td>
                <td>Count of all filed cases.</td>
                <td>—</td>
              </tr>
              <tr>
                <td className="mono">fee_config()</td>
                <td>view</td>
                <td>Deployed fee parameters and accrual counter.</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 24, color: "var(--ink-3)" }} className="marginalia">
            Live contract:{" "}
            <a
              href={explorerAddress(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
            >
              {CONTRACT_ADDRESS}
            </a>
            {" · "}
            Explorer: <a href={BRADBURY_EXPLORER} target="_blank" rel="noreferrer">{BRADBURY_EXPLORER}</a>
          </p>
        </div>
      </section>

      {/* Section 05 — Equivalence and consensus --------------------------- */}
      <section className="section">
        <div className="container grid side">
          <div>
            <div className="section-num">§ 05</div>
            <h2 className="section-title">Equivalence and consensus</h2>
          </div>
          <div>
            <p className="section-lede">
              Adjudication runs inside a single equivalence block. The leader
              validator produces a structured JSON verdict; every other
              validator receives the same rule text and evidence and judges
              whether the leader's verdict is faithful to that input under a
              published criteria. Validators re-derive findings — they do not
              rubber-stamp shape.
            </p>
            <p className="section-lede" style={{ marginTop: 16 }}>
              The verdict schema is fixed: <code className="mono">decision</code>{" "}
              (<code className="mono">in_policy</code>,{" "}
              <code className="mono">out_of_policy</code>,{" "}
              <code className="mono">insufficient_evidence</code>),{" "}
              <code className="mono">confidence</code>{" "}
              (<code className="mono">low</code> · <code className="mono">med</code>{" "}
              · <code className="mono">high</code>),{" "}
              <code className="mono">findings[]</code> keyed by{" "}
              <code className="mono">condition_id</code>, and a bounded
              rationale paragraph.
            </p>
          </div>
        </div>
      </section>

      {/* Section 06 — Filing cost ---------------------------------------- */}
      <section className="section">
        <div className="container grid side">
          <div>
            <div className="section-num">§ 06</div>
            <h2 className="section-title">Cost of filing</h2>
          </div>
          <div>
            <p className="section-lede">
              Filing a case costs the deployed <code className="mono">min_fee</code>{" "}
              (currently 0.01 GEN) plus GenLayer's consensus fee. The wallet
              you sign with pays these directly. If a case is adjudicated
              <code className="mono"> insufficient_evidence</code>, the
              petitioner may re-file with better evidence; if the verdict is
              <code className="mono"> in_policy</code> and the petitioner
              disagrees, they may appeal exactly once.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
