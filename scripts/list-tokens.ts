import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// ─── List payment tokens configured on a deployed MarscatRecharge ──
//
// Discovers every (packageId, token) that was ever priced by scanning
// PackagePriceUpdated events, then reads the CURRENT on-chain price for
// each. A price of 0 means it is no longer active (shown as "inactive").
//
// Usage:
//   npm run list-tokens:bsc
//
// Required .env:
//   CONTRACT_ADDRESS   Deployed MarscatRecharge address
//
// Optional .env:
//   FROM_BLOCK         Block to start scanning from (default 0).
//                      Set to the deployment block to speed up / avoid
//                      RPC log-range limits.
//   LOG_CHUNK          Blocks per getLogs request (default 50000).

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const FROM_BLOCK = Number(process.env.FROM_BLOCK || 0);
const LOG_CHUNK = Number(process.env.LOG_CHUNK || 50000);

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(`Invalid or missing CONTRACT_ADDRESS: ${CONTRACT_ADDRESS}`);
  }

  console.log("Network: ", network.name);
  console.log("Contract:", CONTRACT_ADDRESS, "\n");

  const recharge = await ethers.getContractAt("MarscatRecharge", CONTRACT_ADDRESS);

  // ─── Scan PackagePriceUpdated events in chunks ───────────────
  const latest = await ethers.provider.getBlockNumber();
  const filter = recharge.filters.PackagePriceUpdated();

  // packageId => set of token addresses ever priced
  const seen = new Map<number, Set<string>>();

  for (let from = FROM_BLOCK; from <= latest; from += LOG_CHUNK) {
    const to = Math.min(from + LOG_CHUNK - 1, latest);
    const events = await recharge.queryFilter(filter, from, to);
    for (const ev of events) {
      const args = (ev as any).args;
      const packageId = Number(args.packageId);
      const token = ethers.getAddress(args.token);
      if (!seen.has(packageId)) seen.set(packageId, new Set());
      seen.get(packageId)!.add(token);
    }
  }

  if (seen.size === 0) {
    console.log("No PackagePriceUpdated events found in the scanned range.");
    console.log("If the contract is older than block", FROM_BLOCK, "set FROM_BLOCK lower.");
    return;
  }

  // ─── Cache token metadata ────────────────────────────────────
  const meta = new Map<string, { symbol: string; decimals: number }>();
  async function tokenMeta(addr: string) {
    if (meta.has(addr)) return meta.get(addr)!;
    const t = new ethers.Contract(addr, ERC20_ABI, ethers.provider);
    let symbol = "?";
    let decimals = 18;
    try {
      symbol = await t.symbol();
      decimals = Number(await t.decimals());
    } catch {
      /* non-standard token: fall back to defaults */
    }
    const m = { symbol, decimals };
    meta.set(addr, m);
    return m;
  }

  // ─── Read current prices and print ───────────────────────────
  const packageIds = [...seen.keys()].sort((a, b) => a - b);
  for (const packageId of packageIds) {
    const duration = await recharge.packageDurations(packageId);
    console.log(`Package ${packageId}  (duration: ${duration.toString()}s)`);

    const tokens = [...seen.get(packageId)!].sort();
    for (const token of tokens) {
      const price = await recharge.packagePrices(packageId, token);
      const { symbol, decimals } = await tokenMeta(token);
      if (price > 0n) {
        console.log(
          `  [active]   ${symbol.padEnd(8)} ${token}  ${ethers.formatUnits(price, decimals)} (${price.toString()})`
        );
      } else {
        console.log(`  [inactive] ${symbol.padEnd(8)} ${token}  price=0`);
      }
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
