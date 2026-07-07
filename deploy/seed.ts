/**
 * Seed 4 real end-to-end Counterclaim cases on Bradbury.
 *
 * For each case: file_case (payable) -> poll ACCEPTED -> adjudicate ->
 * poll ACCEPTED -> read the verdict via get_case.
 *
 * Rules are pulled from `rules/*.txt` in the repo — real airdrop-eligibility
 * snapshots (Uniswap UNI, Optimism Airdrop #1, Arbitrum ARB, ENS). The
 * evidence texts describe real-looking wallet situations that clearly meet
 * every published condition, so the correct verdict is "out_of_policy" —
 * i.e., the algorithm violated its own rules.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const REPO_ROOT = process.cwd();
const DEPLOYMENT_FILE = resolve(REPO_ROOT, "deployments/bradbury.json");
const RULES_DIR = resolve(REPO_ROOT, "rules");

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 200; // adjudicate takes longer than deploy
const ACCEPTED = new Set(["ACCEPTED", "FINALIZED", "COMMITTED"]);

interface SeedCase {
  slug: string;
  ruleFile: string;
  respondentLabel: string;
  decisionChallenged: string;
  evidenceText: string;
}

const SEEDS: SeedCase[] = [
  {
    slug: "uniswap-uni",
    ruleFile: "uniswap-uni.txt",
    respondentLabel: "Uniswap UNI Airdrop (Sep 2020)",
    decisionChallenged:
      "The wallet received 0 UNI at the snapshot block and appears in a Sybil cluster labelled by the initial distribution team.",
    evidenceText:
      "The petitioner's wallet 0xC0FFEE0001A11ceB0b0000000000000000000001 executed 14 swaps on Uniswap v2 between June 15, 2020 and August 30, 2020 with different counterparties on different days. The same wallet was a liquidity provider on the DAI/ETH v2 pool from July 4, 2020 to August 29, 2020, depositing $2,400 in ETH. It was never a duplicate address, never used a shared router in a mediated way, and was not associated with any other wallet in the published Sybil-cluster list. The Sybil label appears to have been applied automatically because the wallet shared a common gas-station relayer with several unrelated wallets, but the published rule does not list gas-station relayer overlap as a Sybil signal (X1, X2, X3 do not apply).",
  },
  {
    slug: "optimism-airdrop1",
    ruleFile: "optimism-airdrop1.txt",
    respondentLabel: "Optimism Airdrop #1 (May 2022)",
    decisionChallenged:
      "0 OP tokens allocated. The wallet was placed on the Optimism Sybil filter list.",
    evidenceText:
      "The petitioner's wallet 0xC0FFEE0001A11ceB0b0000000000000000000002 met C1 (paid gas on Optimism), C2 (transactions in 11 distinct calendar weeks between January and March 2022), and C5 (Gitcoin donor: $12 to gr13, $9 to gr14, both non-refunded). None of X1, X2, or X3 applies: the wallet is not a smart contract; it existed years before the snapshot; it is not part of any documented Sybil cluster in the Optimism study; it has no shared funding source with other wallets that were flagged. The wallet's owner is a single individual with a public GitHub profile and long on-chain history, none of which resembles the clustering patterns cited in the Sybil methodology.",
  },
  {
    slug: "arbitrum-arb",
    ruleFile: "arbitrum-arb.txt",
    respondentLabel: "Arbitrum ARB Airdrop (Mar 2023)",
    decisionChallenged:
      "Marked Sybil and awarded 0 ARB. No allocation.",
    evidenceText:
      "The petitioner's wallet 0xC0FFEE0001A11ceB0b0000000000000000000003 satisfied C1 with strong signal: 217 transactions on Arbitrum One spread over 9 distinct months, plus a $312 bridge from Ethereum on July 18, 2022 (well before the September 30, 2022 threshold), plus native DEX activity on GMX, Camelot, and Radiant totalling $18,400 in volume. The wallet also has 21 transactions on Arbitrum Nova (C2). Points total across vectors is well above 3 (X3 does not apply). The wallet is a single-user EOA controlled by one individual (X2 does not apply). Funding history: initial 0.05 ETH from Coinbase on May 2, 2022, followed by DEX profits reinvested. The wallet has no correlated transaction patterns with any other wallet, no deposit-and-withdraw farming loops, no bridge-back-and-forth patterns — none of the X1 signals published by the ARB team apply.",
  },
  {
    slug: "ens",
    ruleFile: "ens.txt",
    respondentLabel: "ENS Governance Token Airdrop (Oct 2021)",
    decisionChallenged:
      "0 ENS allocated because the reverse record was not set at the snapshot block.",
    evidenceText:
      "The petitioner's wallet 0xC0FFEE0001A11ceB0b0000000000000000000004 owned the name 'petitioner.eth' from July 3, 2020 through the snapshot on October 31, 2021 (satisfies C1). The reverse record for this address was set to petitioner.eth on July 3, 2020 via the standard ENS Reverse Registrar, and it has never been unset since (satisfies C2). The name was not expired at any point during the snapshot window (satisfies C3). Given the wallet meets C1, C2, and C3, and none of X1, X2, or X3 applies (this is a hand-controlled personal wallet, not a bot, not a duplicate, and the name was registered normally with a reverse record from day one), the algorithm's 0-ENS decision violates the published rule.",
  },
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var ${name}. Populate the repo-root .env.`);
  }
  return v.trim();
}

function normalizePrivateKey(raw: string): `0x${string}` {
  const s = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) {
    throw new Error("ACCOUNT_PRIVATE_KEY must be 32-byte hex");
  }
  return s as `0x${string}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Bradbury's consensus contract occasionally reverts the outer EVM submission
// (transient sequencer state). Retry a bounded number of times with backoff.
async function writeWithRetry(
  client: any,
  args: any,
  label: string,
  maxTries = 4,
): Promise<string> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return await client.writeContract(args);
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e).slice(0, 120);
      console.log(`    ${label}: submission attempt ${attempt} failed — ${msg}`);
      if (attempt < maxTries) await sleep(6_000 * attempt);
    }
  }
  throw lastErr;
}

async function pollAccepted(client: any, hash: string, label: string) {
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    let tx: any;
    try {
      tx = await client.getTransaction({ hash });
    } catch (err: any) {
      if (attempt % 5 === 0) {
        console.log(`    ${label}: attempt ${attempt} — getTransaction retry (${String(err?.message ?? err).slice(0, 80)})`);
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (!tx) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    const statusName = String(tx.statusName ?? "");
    if (attempt === 1 || attempt % 4 === 0) {
      console.log(`    ${label}: attempt ${attempt} — status=${statusName}`);
    }
    if (ACCEPTED.has(statusName)) return tx;
    if (statusName === "UNDETERMINED" || statusName === "CANCELED") {
      throw new Error(`${label}: transaction ${hash} terminal in state ${statusName}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${label}: timed out waiting for ${hash}`);
}

function txExecutionLabel(tx: any): string {
  return String(tx?.txExecutionResultName ?? tx?.resultName ?? "");
}

async function main() {
  const privateKey = normalizePrivateKey(requireEnv("ACCOUNT_PRIVATE_KEY"));
  if (!existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`Missing ${DEPLOYMENT_FILE}. Run \`npm run deploy\` first.`);
  }
  const deployment = JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8"));
  const contractAddress = deployment.contractAddress as `0x${string}`;
  const minFeeWei = BigInt(deployment.minFeeWei ?? "1000000000000000");

  const account = createAccount(privateKey);
  const client: any = createClient({ chain: testnetBradbury, account });

  console.log("Counterclaim seed");
  console.log(`  contract:  ${contractAddress}`);
  console.log(`  deployer:  ${account.address}`);
  console.log(`  min_fee:   ${minFeeWei.toString()} wei`);
  console.log(`  seeds:     ${SEEDS.length}`);

  const startingTotal: bigint = BigInt(
    (await client.readContract({
      address: contractAddress,
      functionName: "total_cases",
      args: [],
    })) as string | number,
  );
  console.log(`  starting total_cases: ${startingTotal}`);
  console.log();

  const explorerBase = deployment.explorer as string;

  for (let idx = 0; idx < SEEDS.length; idx++) {
    const seed = SEEDS[idx];
    console.log(`Case ${idx + 1}/${SEEDS.length}: ${seed.slug}`);

    const rulePath = resolve(RULES_DIR, seed.ruleFile);
    if (!existsSync(rulePath)) {
      throw new Error(`Rule file not found: ${rulePath}`);
    }
    const ruleText = readFileSync(rulePath, "utf8");

    console.log(`  filing (${ruleText.length} bytes of rule text)...`);
    const fileTxHash = (await writeWithRetry(client, {
      address: contractAddress,
      functionName: "file_case",
      args: [seed.respondentLabel, ruleText, seed.decisionChallenged, seed.evidenceText],
      value: minFeeWei,
      consensusMaxRotations: 3,
    }, `file_case ${seed.slug}`)) as string;
    console.log(`    file tx: ${explorerBase}/tx/${fileTxHash}`);
    const fileTx = await pollAccepted(client, fileTxHash, `file_case ${seed.slug}`);
    console.log(`    file result: ${txExecutionLabel(fileTx)}`);

    // Give the sequencer a beat to reflect the new nonce before submitting the next tx.
    await sleep(4_000);

    // Fetch the case_id — it's the current total_cases after the file.
    const totalAfter = BigInt(
      (await client.readContract({
        address: contractAddress,
        functionName: "total_cases",
        args: [],
      })) as string | number,
    );
    const caseId = Number(totalAfter);
    console.log(`    case_id: ${caseId}`);

    console.log(`  adjudicating case ${caseId}...`);
    const adjTxHash = (await writeWithRetry(client, {
      address: contractAddress,
      functionName: "adjudicate",
      args: [caseId],
      consensusMaxRotations: 3,
    }, `adjudicate ${seed.slug}`)) as string;
    console.log(`    adjudicate tx: ${explorerBase}/tx/${adjTxHash}`);
    const adjTx = await pollAccepted(client, adjTxHash, `adjudicate ${seed.slug}`);
    console.log(`    adjudicate result: ${txExecutionLabel(adjTx)}`);

    // Read final case state
    const caseState = (await client.readContract({
      address: contractAddress,
      functionName: "get_case",
      args: [caseId],
    })) as any;
    console.log(`    verdict: ${caseState.verdict_decision} (${caseState.verdict_confidence})`);
    console.log(`    findings: ${caseState.findings?.length ?? 0}`);
    console.log(`    rationale: ${String(caseState.verdict_rationale).slice(0, 160)}...`);
    console.log();

    // Small delay before starting the next seed iteration to let the nonce settle.
    await sleep(4_000);
  }

  const finalTotal: bigint = BigInt(
    (await client.readContract({
      address: contractAddress,
      functionName: "total_cases",
      args: [],
    })) as string | number,
  );
  console.log(`Done. total_cases went from ${startingTotal} to ${finalTotal}.`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
