import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// ─── Add a payable token to an already-deployed MarscatRecharge ───
//
// Usage:
//   DRY_RUN=true npm run add-token:bsc     # preview, no tx sent
//   npm run add-token:bsc                  # execute
//
// Required .env:
//   CONTRACT_ADDRESS          Deployed MarscatRecharge address
//   NEW_TOKEN_ADDRESS         ERC20 token to add as a payment option
//   NEW_TOKEN_QUARTERLY_PRICE Human-readable price, e.g. "9.9"
//   NEW_TOKEN_YEARLY_PRICE    Human-readable price, e.g. "29.9"
//   PRIVATE_KEY               MUST be the current owner's key (onlyOwner)
//
// Optional .env:
//   PACKAGE_QUARTERLY (default 1), PACKAGE_YEARLY (default 2)
//   DRY_RUN=true to simulate without sending transactions.

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const NEW_TOKEN_ADDRESS = process.env.NEW_TOKEN_ADDRESS;
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === "true";

const PACKAGE_QUARTERLY = Number(process.env.PACKAGE_QUARTERLY || 1);
const PACKAGE_YEARLY = Number(process.env.PACKAGE_YEARLY || 2);

// Minimal ERC20 ABI for metadata reads.
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  // ─── Validate inputs ─────────────────────────────────────────
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(`Invalid or missing CONTRACT_ADDRESS: ${CONTRACT_ADDRESS}`);
  }
  if (!NEW_TOKEN_ADDRESS || !ethers.isAddress(NEW_TOKEN_ADDRESS)) {
    throw new Error(`Invalid or missing NEW_TOKEN_ADDRESS: ${NEW_TOKEN_ADDRESS}`);
  }

  const quarterlyPriceStr = process.env.NEW_TOKEN_QUARTERLY_PRICE;
  const yearlyPriceStr = process.env.NEW_TOKEN_YEARLY_PRICE;
  if (!quarterlyPriceStr || !yearlyPriceStr) {
    throw new Error(
      "NEW_TOKEN_QUARTERLY_PRICE and NEW_TOKEN_YEARLY_PRICE must be set in .env"
    );
  }

  const [signer] = await ethers.getSigners();
  console.log("Signer account:", signer.address);
  console.log("Current network:", network.name);

  // ─── Read token metadata (decimals drive the amount math) ────
  const token = new ethers.Contract(NEW_TOKEN_ADDRESS, ERC20_ABI, signer);
  let decimals: number;
  let symbol: string;
  try {
    decimals = Number(await token.decimals());
    symbol = await token.symbol();
  } catch {
    throw new Error(
      `Could not read decimals()/symbol() from ${NEW_TOKEN_ADDRESS} — is it a valid ERC20 on this network?`
    );
  }

  const quarterlyPrice = ethers.parseUnits(quarterlyPriceStr, decimals);
  const yearlyPrice = ethers.parseUnits(yearlyPriceStr, decimals);

  // ─── Connect to the deployed contract ────────────────────────
  const recharge = await ethers.getContractAt(
    "MarscatRecharge",
    CONTRACT_ADDRESS,
    signer
  );

  // ─── Verify the signer is the current owner ──────────────────
  const owner = await recharge.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer is not the contract owner.\n  owner:  ${owner}\n  signer: ${signer.address}\n` +
        `Set PRIVATE_KEY in .env to the owner's key.`
    );
  }

  // ─── Preview ─────────────────────────────────────────────────
  const plan = [
    { packageId: PACKAGE_QUARTERLY, label: "Quarterly", amount: quarterlyPrice, human: quarterlyPriceStr },
    { packageId: PACKAGE_YEARLY, label: "Yearly", amount: yearlyPrice, human: yearlyPriceStr },
  ];

  console.log("\n========== Plan ==========");
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Token:   ", `${NEW_TOKEN_ADDRESS} (${symbol}, ${decimals} decimals)`);
  for (const p of plan) {
    const existing = await recharge.packagePrices(p.packageId, NEW_TOKEN_ADDRESS);
    const note = existing > 0n ? ` (OVERWRITES existing ${existing.toString()})` : "";
    console.log(
      `  package ${p.packageId} (${p.label}): ${p.human} ${symbol} = ${p.amount.toString()} base units${note}`
    );
  }

  if (DRY_RUN) {
    console.log("\nDRY_RUN=true — no transactions sent.");
    return;
  }

  // ─── Execute ─────────────────────────────────────────────────
  console.log("\nSending transactions...");
  for (const p of plan) {
    const tx = await recharge.setPackagePrice(p.packageId, NEW_TOKEN_ADDRESS, p.amount);
    console.log(`  package ${p.packageId} (${p.label}): tx ${tx.hash}`);
    await tx.wait();
  }

  // ─── Verify on-chain ─────────────────────────────────────────
  console.log("\nVerifying on-chain...");
  for (const p of plan) {
    const stored = await recharge.packagePrices(p.packageId, NEW_TOKEN_ADDRESS);
    if (stored !== p.amount) {
      throw new Error(
        `Verification failed for package ${p.packageId}: expected ${p.amount}, got ${stored}`
      );
    }
    console.log(`  package ${p.packageId} (${p.label}): ${stored.toString()} ✓`);
  }

  console.log("\n========== Done ==========");
  console.log(`${symbol} is now accepted for packages ${PACKAGE_QUARTERLY} and ${PACKAGE_YEARLY}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
