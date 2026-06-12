# Marscat Recharge Contract

A USDT recharge contract on the BSC chain, built with Hardhat + TypeScript.

## Requirements

- Node.js >= 18
- npm >= 8

## Install Dependencies
```bash
npm install
```

## Configure Environment Variables
```bash
cp .env.example .env
```

Edit `.env` and fill in:
```
PRIVATE_KEY=your_wallet_private_key
```

## Compile Contracts
```bash
npm run compile
```

## Run Unit Tests
```bash
npm run test
```

## Deploy

**BSC Testnet:**
```bash
npm run deploy:bscTestnet
```

**BSC Mainnet:**
```bash
npm run deploy:bsc
```

## Package Plans

| Package ID | Name          | Price (USDT) | Duration |
|------------|---------------|--------------|----------|
| 1          | Quarterly Plan | 9.9         | 90 days  |
| 2          | Yearly Plan    | 29.9        | 365 days |

## Project Structure
```
marscat-recharge/
├── contracts/
│   ├── MarscatRecharge.sol      # Main contract
│   └── MockUSDT.sol             # Mock USDT for testing
├── scripts/
│   └── deploy.ts                # Deployment script
├── test/
│   └── MarscatRecharge.test.ts  # Unit tests
├── hardhat.config.ts
├── tsconfig.json
├── .env.example
└── package.json
```