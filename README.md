# PiggyBank 🐷

PiggyBank is a decentralized, automated savings protocol built on the Electroneum blockchain. It turns your stablecoins into a habit. Create a plan, approve once, and monitor every payment until your savings goal is complete.

## Architecture

This repository contains three main components:

1. **`piggybank/`** (Smart Contracts)
   - Foundry project containing the Solidity smart contracts.
   - Core contract: `PiggyBank.sol` (handles plan creation, deductions, and claims).
   - Deployed on Electroneum Testnet.

2. **`piggybank-indexer/`** (Backend API & Indexer)
   - Node.js backend using SQLite.
   - Listens to smart contract events on the Electroneum blockchain.
   - Serves an API for the frontend to fetch fully hydrated plan data instantly, without relying on slow blockchain RPC calls.

3. **`piggybank-frontend/`** (Web3 dApp)
   - Next.js 14 App Router application.
   - Styled with Tailwind CSS.
   - Integrates with Ethers.js for wallet connections and transactions.
   - Fetches dashboard data directly from the local Indexer API.

## Getting Started

### 1. Smart Contracts
```bash
cd piggybank
forge install
forge build
```

### 2. Backend Indexer
```bash
cd piggybank-indexer
npm install
npm run start
```
*The indexer will start on `http://localhost:3001` and immediately begin syncing blocks to build the local SQLite database.*

### 3. Frontend dApp
In a new terminal window:
```bash
cd piggybank-frontend
pnpm install
pnpm dev
```
*The web interface will be available at `http://localhost:3000`.*

## V2 Roadmap (Next Objectives)

We are currently planning the next major iteration of PiggyBank with the following MVP 2 features:

1. **Multiple Stablecoins**: Refactoring contracts and UI to move away from hardcoded USDC to support multiple stablecoin deposits with dynamic decimal handling.
2. **Yield Integration**: Integrating a yield-bearing platform (e.g., Aave/Compound equivalent on Electroneum) so user deposits earn interest while locked in the PiggyBank.
3. **PostgreSQL Migration**: Migrating the backend indexer database from SQLite to PostgreSQL for production readiness.

---
Built for the Electroneum African Builders Program.
