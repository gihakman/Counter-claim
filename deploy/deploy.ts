/**
 * Deploy the Counterclaim intelligent contract to GenLayer Bradbury.
 *
 * Reads ACCOUNT_PRIVATE_KEY, FEE_RECIPIENT, and FEE_BPS from the repo-root .env.
 * Writes the deployed contract address and deploy tx hash to `deployments/bradbury.json`.
 * Verifies the contract is live by reading a view method (`total_cases`).
 *
 * Never prints or logs the private key.
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";

const CONTRACT_PATH = resolve(process.cwd(), "contracts/counterclaim.py");
const DEPLOYMENTS_DIR = resolve(process.cwd(), "deployments");
const DEPLOYMENT_FILE = resolve(DEPLOYMENTS_DIR, "bradbury.json");

const DEFAULT_MIN_FEE_WEI = 10n ** 16n; // 0.01 GEN — well above consensus dust floor
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 120;         // ~6 min ceiling
const ACCEPTED_STATE_NAMES = new Set([
  "ACCEPTED",
  "FINALIZED",
  "COMMITTED",
]);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var ${name}. Populate the repo-root .env.`);
  }
  return v.trim();
}

function optionalEnv(name: string, fallback = ""): string {
  const v = process.env[name];
  return (v ?? fallback).trim();
}

function normalizePrivateKey(raw: string): `0x${string}` {
  const s = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) {
    throw new Error("ACCOUNT_PRIVATE_KEY must be 32-byte hex, optionally prefixed with 0x");
  }
  return s as `0x${string}`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Poll the tx by name (statusName) so we can tolerate SDK BigInt edge cases
// on the deep receipt shape.
async function waitForAcceptedTx(client: any, hash: string) {
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    let tx: any;
    try {
      tx = await client.getTransaction({ hash });
    } catch (err: any) {
      // BigInt serialize edge cases surface as thrown errors from the SDK's
      // receipt decoder. Wait and retry.
      if (attempt % 5 === 0) {
        console.log(`  attempt ${attempt}: retrying getTransaction (${String(err?.message ?? err).slice(0, 80)})`);
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (!tx) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    const statusName: string = String(tx.statusName ?? tx.status ?? "");
    if (attempt === 1 || attempt % 4 === 0) {
      console.log(`  attempt ${attempt}: status=${statusName}`);
    }
    if (ACCEPTED_STATE_NAMES.has(statusName)) {
      return tx;
    }
    if (statusName === "UNDETERMINED" || statusName === "CANCELED") {
      throw new Error(`Transaction ${hash} terminal in state ${statusName}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${hash} to reach ACCEPTED`);
}

function extractContractAddress(tx: any): string | undefined {
  // The SDK exposes the deployed contract address on the decoded tx receipt in
  // different shapes across versions; check the common paths.
  return (
    tx?.data?.contract_address ??
    tx?.contract_address ??
    tx?.txDataDecoded?.contract_address ??
    tx?.txDataDecoded?.contractAddress ??
    tx?.recipient ??
    tx?.receipt?.contract_address ??
    tx?.consensus_data?.leader_receipt?.[0]?.contract_address
  );
}

async function main() {
  const privateKey = normalizePrivateKey(requireEnv("ACCOUNT_PRIVATE_KEY"));
  const feeRecipient = optionalEnv("FEE_RECIPIENT", "");
  const feeBps = parseInt(optionalEnv("FEE_BPS", "100"), 10);
  if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new Error(`FEE_BPS must be an integer in 0..10000 (got ${feeBps})`);
  }

  if (!existsSync(CONTRACT_PATH)) {
    throw new Error(`Contract file not found: ${CONTRACT_PATH}`);
  }
  const contractCode = new Uint8Array(readFileSync(CONTRACT_PATH));

  const account = createAccount(privateKey);
  const client: any = createClient({
    chain: testnetBradbury,
    account,
  });

  console.log("Counterclaim deploy");
  console.log(`  chain:          ${testnetBradbury.name} (id ${testnetBradbury.id})`);
  console.log(`  rpc:            ${testnetBradbury.rpcUrls.default.http[0]}`);
  console.log(`  explorer:       ${testnetBradbury.blockExplorers?.default.url ?? "n/a"}`);
  console.log(`  deployer:       ${account.address}`);
  console.log(`  min_fee (wei):  ${DEFAULT_MIN_FEE_WEI.toString()}`);
  console.log(`  fee_recipient:  ${feeRecipient || "(deployer)"}`);
  console.log(`  fee_bps:        ${feeBps}`);
  console.log();

  console.log("Submitting deploy transaction...");
  const deployTxHash = (await client.deployContract({
    code: contractCode,
    args: [DEFAULT_MIN_FEE_WEI, feeRecipient, feeBps],
  })) as TransactionHash;
  console.log(`  tx:             ${deployTxHash}`);

  console.log("Polling for ACCEPTED status...");
  const tx = await waitForAcceptedTx(client, deployTxHash);
  const contractAddress = extractContractAddress(tx);
  if (!contractAddress) {
    throw new Error(
      `Deploy accepted but contract address missing on receipt: ${Object.keys(tx || {}).join(", ")}`,
    );
  }
  console.log(`  contract:       ${contractAddress}`);

  // --- Verify the contract is live by reading a view method
  console.log("\nVerifying contract via view call `total_cases`...");
  const total = await client.readContract({
    address: contractAddress as `0x${string}`,
    functionName: "total_cases",
    args: [],
  });
  console.log(`  total_cases():  ${String(total)}`);

  const feeConfig = await client.readContract({
    address: contractAddress as `0x${string}`,
    functionName: "fee_config",
    args: [],
  });
  console.log(`  fee_config():   ${JSON.stringify(feeConfig)}`);

  // --- Persist deployment info
  mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  const explorerBase = (testnetBradbury.blockExplorers?.default.url ?? "").replace(/\/$/, "");
  const deployment = {
    network: "testnet-bradbury",
    chainId: testnetBradbury.id,
    rpc: testnetBradbury.rpcUrls.default.http[0],
    explorer: explorerBase,
    contractAddress,
    deployTxHash,
    explorerContract: `${explorerBase}/address/${contractAddress}`,
    explorerDeployTx: `${explorerBase}/tx/${deployTxHash}`,
    deployer: account.address,
    minFeeWei: DEFAULT_MIN_FEE_WEI.toString(),
    feeRecipient: feeRecipient || account.address,
    feeBps,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2) + "\n", "utf8");

  console.log(`\nContract live. Deployment written to ${DEPLOYMENT_FILE}`);
  console.log(`  explorer:       ${deployment.explorerContract}`);
  console.log(`  deploy tx:      ${deployment.explorerDeployTx}`);
  console.log(`  short tx:       ${shortHash(deployTxHash)}`);
}

main().catch((err) => {
  console.error("\nDeploy failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
