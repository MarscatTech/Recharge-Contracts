import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// ─── Network Configuration ───────────────────────────────────────
const BSC_USDT = process.env.USDT_ADDRESS;

// ─── New Owner ───────────────────────────────────────────────────
const NEW_OWNER = process.env.NEW_OWNER_ADDRESS;

// ─── Package Configuration ───────────────────────────────────────
const PACKAGE_QUARTERLY = Number(process.env.PACKAGE_QUARTERLY || 1);
const PACKAGE_YEARLY    = Number(process.env.PACKAGE_YEARLY || 2);

const QUARTERLY_PRICE = ethers.parseEther(
  process.env.QUARTERLY_PRICE || "9.9"
);

const YEARLY_PRICE = ethers.parseEther(
  process.env.YEARLY_PRICE || "29.9"
);

const QUARTERLY_DURATION = Number(
  process.env.QUARTERLY_DURATION || 7776000
);

const YEARLY_DURATION = Number(
  process.env.YEARLY_DURATION || 31536000
);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer account:", deployer.address);
  console.log("Current network:", network.name);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "BNB\n");

  // ─── 1. Deploy Contract ──────────────────────────────────────
  console.log("Deploying MarscatRecharge...");
  const MarscatRecharge = await ethers.getContractFactory("MarscatRecharge");
  const recharge = await MarscatRecharge.deploy();
  await recharge.waitForDeployment();

  const contractAddress = await recharge.getAddress();
  console.log("Contract address:", contractAddress);

  // ─── 2. Configure Package Durations ─────────────────────────
  console.log("\nConfiguring package durations...");
  await (await recharge.setPackageDuration(PACKAGE_QUARTERLY, QUARTERLY_DURATION)).wait();
  console.log(`Quarterly package duration: ${QUARTERLY_DURATION} seconds`);
  await (await recharge.setPackageDuration(PACKAGE_YEARLY, YEARLY_DURATION)).wait();
  console.log(`Yearly package duration: ${YEARLY_DURATION} seconds`);

  // ─── 3. Configure Package Prices ────────────────────────────
  const usdtAddress = BSC_USDT;
  console.log(`\nConfiguring package prices (USDT: ${usdtAddress})...`);
  await (await recharge.setPackagePrice(PACKAGE_QUARTERLY, usdtAddress, QUARTERLY_PRICE)).wait();
  console.log(`Quarterly package price: ${ethers.formatEther(QUARTERLY_PRICE)} USDT`);
  await (await recharge.setPackagePrice(PACKAGE_YEARLY, usdtAddress, YEARLY_PRICE)).wait();
  console.log(`Yearly package price: ${ethers.formatEther(YEARLY_PRICE)} USDT`);

  // ─── 4. Transfer Ownership ───────────────────────────────────
  if (!NEW_OWNER) {
    throw new Error("NEW_OWNER_ADDRESS is not set in .env");
  }
  if (!ethers.isAddress(NEW_OWNER)) {
    throw new Error(`Invalid NEW_OWNER_ADDRESS: ${NEW_OWNER}`);
  }

  console.log("\nTransferring ownership...");
  await (await recharge.transferOwnership(NEW_OWNER)).wait();
  console.log(`Ownership transferred to: ${NEW_OWNER}`);

  // ─── 5. Verify New Owner On-chain ───────────────────────────
  const currentOwner = await recharge.owner();
  if (currentOwner.toLowerCase() !== NEW_OWNER.toLowerCase()) {
    throw new Error(`Ownership transfer failed! Current owner: ${currentOwner}`);
  }
  console.log("On-chain owner verified ✓");

  // ─── 6. Print Deployment Summary ────────────────────────────
  console.log("\n========== Deployment Complete ==========");
  console.log("Contract address:", contractAddress);
  console.log("Deployer:        ", deployer.address);
  console.log("Owner:           ", currentOwner);
  console.log("Network:         ", network.name);
  console.log("USDT address:    ", usdtAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});