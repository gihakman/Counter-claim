# Counterclaim

**A public, validator-issued verdict layer for algorithmic decisions.**

Counterclaim files, adjudicates, and publishes structured verdicts on decisions an algorithm made under a published rule. Beachhead: airdrop-eligibility disputes. Every verdict is produced by independent validators on the GenLayer Bradbury testnet, is appealable under Optimistic Democracy, and is written to the chain - not to a vendor's dashboard.

- **Live contract**: [`0x3FD5049B60FF5F78a85689BB37Ec3A2F86D1AEE1`](https://explorer-bradbury.genlayer.com/address/0x3FD5049B60FF5F78a85689BB37Ec3A2F86D1AEE1) on Bradbury
- **Deploy transaction**: [`0x70752ddb…d59a6cff`](https://explorer-bradbury.genlayer.com/tx/0x70752ddb4c9ab567816ff606ac3139c0d4d789f52b427772811fedb0d59a6cff)
- **Network**: [GenLayer Bradbury Testnet](https://docs.genlayer.com/) (chain id `4221`, RPC `https://rpc-bradbury.genlayer.com`)
- **Explorer**: <https://explorer-bradbury.genlayer.com>

## What it is

When an algorithm makes a decision against a user under a public rule - a Sybil filter on an airdrop, a demonetization, a deactivation, a denied refund - the user has no cheap, fast, neutral way to test that decision against the published criteria. Complaining is performative; suing is more expensive than the loss.

Counterclaim closes that gap on-chain. The petitioner submits three things:

1. The **rule** the algorithm was supposed to be applying (inline text, or a URL that validators fetch and normalize).
2. The **decision** the algorithm made against them.
3. The **evidence** that shows why the decision violated the rule.

Independent validators on GenLayer read the same inputs, reason about whether the decision is defensible under the rule, and reach a structured consensus verdict:

```json
{
  "decision":   "in_policy" | "out_of_policy" | "insufficient_evidence",
  "confidence": "low" | "med" | "high",
  "findings":   [ { "condition_id": "C1", "description": "...", "met": true|false, "confidence": "..." } ],
  "rationale":  "one paragraph, faithful to rule + evidence"
}
```

That structured verdict - decision, confidence, per-condition findings, rationale - is written on-chain. The petitioner may appeal once; anyone may read the record forever.

## Why on GenLayer

A verdict's only product is credibility. Credibility cannot come from a single vendor's LLM (capturable, replaceable), a single arbitrator (capturable, biased), or a deterministic engine (cannot interpret natural-language rules). GenLayer is the only environment where:

- multiple validators independently fetch or receive the rule and evidence,
- each independently reasons over them with an LLM,
- structured consensus is enforced by an equivalence principle (`gl.eq_principle.prompt_non_comparative`), and
- appeals are first-class under Optimistic Democracy.

The Counterclaim adjudication runs inside a single equivalence block. The leader validator emits a structured JSON verdict; every other validator independently checks whether the leader's verdict is faithful to the same rule and evidence, under a fixed criteria that pins the schema and the reasoning boundaries.

## Contract surface

Five writes, four views, deployed as a single intelligent contract:

| Method | Type | Payable | Purpose |
| --- | --- | --- | --- |
| `file_case(respondent, rule_text, decision, evidence)` | write | yes | Open a docket with an inline rule snapshot. |
| `file_case_from_url(respondent, url, decision, evidence)` | write | yes | Open a docket whose rule text is fetched by validators from a `.com`/`.org`/`.io` URL. |
| `adjudicate(case_id)` | write | no | Run the verdict round. |
| `appeal(case_id)` | write | no | Petitioner-only single-shot appeal. |
| `withdraw_fees()` | write | no | Fee recipient sweeps accrued fees per `fee_bps`. |
| `get_case(id)` | view | - | Return one case as a structured record. |
| `list_cases(offset, limit)` | view | - | Paginated docket listing. |
| `total_cases()` | view | - | Total cases filed. |
| `fee_config()` | view | - | Deployed fee parameters. |

The ABI schema is generated from the contract by `genvm-lint schema` and shipped as `deployments/counterclaim.schema.json`.

## Tech

- **Contract**: Python 3.12 intelligent contract, pinned GenVM runner (`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`), storage via `TreeMap[u256, Case]` + `DynArray[u256]`, verdicts via `gl.eq_principle.prompt_non_comparative`.
- **Lint / test**: `genvm-linter` for AST + SDK validation; `genlayer-test` for direct-mode tests (12 tests, all passing).
- **Deploy / seed**: TypeScript scripts using `genlayer-js` (`createClient`, `createAccount`) targeting Bradbury directly.
- **Frontend**: React 18 + Vite 5 + TypeScript. `genlayer-js` for reads and writes. Wallet integration uses raw EIP-1193 (`window.ethereum`) with `wallet_addEthereumChain` and `wallet_switchEthereumChain` - no MetaMask Snap required. Live transaction status polls the chain and links to the Bradbury explorer.
- **Hosting**: Vercel-deployable from the repo root via `vercel.json`.

## Repository layout

```
contracts/counterclaim.py       Intelligent contract (pinned runner)
tests/direct/                   Direct-mode tests (genlayer-test)
deploy/deploy.ts                Deploy script (genlayer-js, Bradbury)
deploy/seed.ts                  Seeds real end-to-end cases on-chain
rules/                          Real airdrop-rule snapshots used by seed
app/                            React + Vite frontend
deployments/bradbury.json       Deployment record (address, tx, config)
deployments/counterclaim.schema.json  ABI schema for the deployed contract
```

## Local development

Prerequisites: Python 3.12 (via `uv`), Node.js 20+, a funded Bradbury account.

```bash
# Python side (linter + tests)
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt

genvm-lint check contracts/counterclaim.py
pytest tests/direct -v

# JS side (deploy, seed, and the app)
npm install
npm --prefix app install
npm --prefix app run dev             # local dev server
npm --prefix app run build           # production bundle to app/dist

# Deploy to Bradbury (uses ACCOUNT_PRIVATE_KEY from .env)
npm run deploy

# Seed 4 real end-to-end cases on-chain (files + adjudicates)
npm run seed
```

### Environment

`.env` at the repo root:

- `ACCOUNT_PRIVATE_KEY` - funded Bradbury private key. **Never committed.** Used only to sign the deploy and seed transactions.
- `FEE_RECIPIENT` - optional. Address that receives protocol fees. Defaults to the deployer.
- `FEE_BPS` - optional. Basis points routed to `FEE_RECIPIENT` on withdrawal. Default `100` (1.00%).

`app/.env` is optional:

- `VITE_COUNTERCLAIM_ADDRESS` - override the deployed contract address at build time. If unset, the address is baked into `app/src/lib/config.ts`, so the hosted site works with zero configuration.

Copy `.env.example` (repo root) or `app/.env.example` before making a real `.env`. Real values must never be committed.

## Deployment

`npm run deploy` compiles and submits the contract to Bradbury, polls until `ACCEPTED`, then verifies the contract is live by calling two view methods (`total_cases`, `fee_config`) and writes a machine-readable record to `deployments/bradbury.json`. The deploy is idempotent from the ACCOUNT_PRIVATE_KEY holder's perspective; running it again produces a fresh contract at a new address.

## Hosting

`vercel.json` at the repo root builds `app/dist` from `app/`. `.vercelignore` keeps Python virtualenvs, tests, contracts, and deploy scripts out of the Vercel build image. The deployed contract address is baked into the frontend, so the hosted site works with zero environment configuration; override with `VITE_COUNTERCLAIM_ADDRESS` if you deploy your own contract.

## What it is not

This service is **not legal advice**. A Counterclaim verdict is a public, structured, on-chain expert opinion produced by independent validators reasoning about a published rule. Petitioners use verdicts to pressure operators on social media, attach to regulator complaints, or escalate to private dispute resolution. It is not a court ruling.

## License

MIT.
