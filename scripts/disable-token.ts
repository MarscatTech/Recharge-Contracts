import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// ─── Disable a payment token on a deployed MarscatRecharge ─────────
//
// The deployed contract has no "remove price" function, so a token is
// disabled by setting its price astronomically high. No wallet holds
// that many tokens, so safeTransferFrom always reverts — the token
// becomes effectively unpayable. Reversible: re-run add-token.ts with a
// normal price to re-enable.
//
// Usage:
//   DRY_RUN=true npm run disable-token:bsc   # preview, no tx sent
//   npm run disable-token:bsc                # execute
//
// Required .env:
//   CONTRACT_ADDRESS        Deployed MarscatRecharge address
//   DISABLE_TOKEN_ADDRESS   Token to disable (e.g. USDT)
//   PRIVATE_KEY             MUST be the current owner's key (onlyOwner)
//
// Optional .env:
//   PACKAGE_QUARTERLY (default 1), PACKAGE_YEARLY (default 2)
//   DRY_RUN=true to simulate without sending transactions.

// 1e50 base units — far above any ERC20 total supply, so no transfer can
// ever succeed, yet well within uint256 max (~1.15e77).
const DISABLE_PRICE = 10n ** 50n;

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const DISABLE_TOKEN_ADDRESS = process.env.DISABLE_TOKEN_ADDRESS;
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === "true";

const PACKAGE_QUARTERLY = Number(process.env.PACKAGE_QUARTERLY || 1);
const PACKAGE_YEARLY = Number(process.env.PACKAGE_YEARLY || 2);

const ERC20_ABI = ["function symbol() view returns (string)"];

async function main() {
  // ─── Validate inputs ─────────────────────────────────────────
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(`Invalid or missing CONTRACT_ADDRESS: ${CONTRACT_ADDRESS}`);
  }
  if (!DISABLE_TOKEN_ADDRESS || !ethers.isAddress(DISABLE_TOKEN_ADDRESS)) {
    throw new Error(`Invalid or missing DISABLE_TOKEN_ADDRESS: ${DISABLE_TOKEN_ADDRESS}`);
  }

  const [signer] = await ethers.getSigners();
  console.log("Signer account:", signer.address);
  console.log("Current network:", network.name);

  const token = new ethers.Contract(DISABLE_TOKEN_ADDRESS, ERC20_ABI, signer);
  let symbol = "?";
  try {
    symbol = await token.symbol();
  } catch {
    /* non-standard token: keep placeholder symbol */
  }

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

  const packageIds = [PACKAGE_QUARTERLY, PACKAGE_YEARLY];

  // ─── Preview ─────────────────────────────────────────────────
  console.log("\n========== Plan ==========");
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Token:   ", `${DISABLE_TOKEN_ADDRESS} (${symbol})`);
  console.log("Action:  ", `set price to ${DISABLE_PRICE.toString()} (effectively unpayable)`);
  for (const packageId of packageIds) {
    const current = await recharge.packagePrices(packageId, DISABLE_TOKEN_ADDRESS);
    console.log(`  package ${packageId}: current price ${current.toString()}`);
  }

  if (DRY_RUN) {
    console.log("\nDRY_RUN=true — no transactions sent.");
    return;
  }

  // ─── Execute ─────────────────────────────────────────────────
  console.log("\nSending transactions...");
  for (const packageId of packageIds) {
    const tx = await recharge.setPackagePrice(packageId, DISABLE_TOKEN_ADDRESS, DISABLE_PRICE);
    console.log(`  package ${packageId}: tx ${tx.hash}`);
    await tx.wait();
  }

  // ─── Verify on-chain ─────────────────────────────────────────
  console.log("\nVerifying on-chain...");
  for (const packageId of packageIds) {
    const stored = await recharge.packagePrices(packageId, DISABLE_TOKEN_ADDRESS);
    if (stored !== DISABLE_PRICE) {
      throw new Error(
        `Verification failed for package ${packageId}: expected ${DISABLE_PRICE}, got ${stored}`
      );
    }
    console.log(`  package ${packageId}: ${stored.toString()} ✓`);
  }

  console.log("\n========== Done ==========");
  console.log(`${symbol} is now effectively disabled for packages ${packageIds.join(" and ")}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
