import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// ─── Show payment-token prices on a deployed MarscatRecharge ───────
//
// Directly reads packagePrices(packageId, token) for a known list of
// tokens — no event scanning, no block-range limits. A price of 0 means
// the token is not accepted; an astronomically high price means it was
// disabled via disable-token.
//
// Usage:
//   npm run list-tokens:bsc
//
// Required .env:
//   CONTRACT_ADDRESS   Deployed MarscatRecharge address
//
// Tokens checked (first non-empty source wins):
//   CHECK_TOKENS       Comma-separated token addresses, OR
//   USDT_ADDRESS + NEW_TOKEN_ADDRESS   (fallback)
//
// Optional .env:
//   PACKAGE_QUARTERLY (default 1), PACKAGE_YEARLY (default 2)

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PACKAGE_QUARTERLY = Number(process.env.PACKAGE_QUARTERLY || 1);
const PACKAGE_YEARLY = Number(process.env.PACKAGE_YEARLY || 2);

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

function resolveTokens(): string[] {
  const raw =
    process.env.CHECK_TOKENS ||
    [process.env.USDT_ADDRESS, process.env.NEW_TOKEN_ADDRESS]
      .filter(Boolean)
      .join(",");

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  for (const t of tokens) {
    if (!ethers.isAddress(t)) throw new Error(`Invalid token address: ${t}`);
  }
  // Dedupe (checksummed)
  return [...new Set(tokens.map((t) => ethers.getAddress(t)))];
}

async function main() {
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(`Invalid or missing CONTRACT_ADDRESS: ${CONTRACT_ADDRESS}`);
  }

  const tokens = resolveTokens();
  if (tokens.length === 0) {
    throw new Error(
      "No tokens to check. Set CHECK_TOKENS (comma-separated) or USDT_ADDRESS/NEW_TOKEN_ADDRESS in .env."
    );
  }

  console.log("Network: ", network.name);
  console.log("Contract:", CONTRACT_ADDRESS, "\n");

  const recharge = await ethers.getContractAt("MarscatRecharge", CONTRACT_ADDRESS);
  const packageIds = [PACKAGE_QUARTERLY, PACKAGE_YEARLY];

  for (const packageId of packageIds) {
    const duration = await recharge.packageDurations(packageId);
    console.log(`Package ${packageId}  (duration: ${duration.toString()}s)`);

    for (const token of tokens) {
      const price = await recharge.packagePrices(packageId, token);

      let symbol = "?";
      let decimals = 18;
      try {
        const t = new ethers.Contract(token, ERC20_ABI, ethers.provider);
        symbol = await t.symbol();
        decimals = Number(await t.decimals());
      } catch {
        /* non-standard token: fall back to defaults */
      }

      if (price === 0n) {
        console.log(`  [not accepted] ${symbol.padEnd(8)} ${token}`);
      } else if (price > 10n ** 40n) {
        console.log(`  [disabled]     ${symbol.padEnd(8)} ${token}  price too high to pay`);
      } else {
        console.log(
          `  [active]       ${symbol.padEnd(8)} ${token}  ${ethers.formatUnits(price, decimals)} (${price.toString()})`
        );
      }
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
