# PiggyBank 🐷

PiggyBank is a decentralized, automated savings protocol built on the Electroneum blockchain. It turns your stablecoins into a habit. Create a plan, approve once, and monitor every payment until your savings goal is complete.

## 🚀 Deployed Contracts (Electroneum Testnet)
- **PiggyBank Protocol:** `0xe3665FbFf485aF993Fa03fae2CCD583b6F770C6d`
- **Mock USDC (6 Decimals):** `0xe998234aa8a6743d00b738B6cbbE7DB63C60eFb2`

## 🏗️ Architecture Design

This project is structured as a full-stack, production-ready decentralized application divided into three core components:

### 1. `piggybank/` (Smart Contracts)
- **Framework:** Foundry
- **Core Logic:** `PiggyBank.sol` acts as a vault and clearinghouse. Users create savings plans, setting a goal, cadence, and amount.
- **Automation:** The contract relies on an external "Keeper" bot to call the `deduct()` function when a round is due. If the Keeper is late, it uses `catchUpRounds` to instantly process any missed payments in a single transaction.
- **Tokens:** Supports ERC20 tokens (currently using a 6-decimal MockUSDC).

### 2. `piggybank-indexer/` (Cloud Backend & Keeper Bot)
- **Framework:** Node.js + TypeScript
- **Database:** PostgreSQL (hosted on Supabase)
- **Hosting:** Render (Runs 24/7 as a Web Service)
- **Roles:**
  - **Indexer:** Listens for `PlanCreated`, `RoundPaid`, and `PlanCompleted` events via WebSockets/RPC polling. It structures this data in Supabase so the frontend can query it in milliseconds.
  - **Keeper:** A background service armed with a private key that continuously checks the database for plans that are "due" for a deduction. It submits the `deduct()` transactions to the blockchain automatically, completely abstracting the savings process for the user.
  - **API:** Serves `/api/plans`, `/api/admin/stats` to hydrate the dashboard UI.

### 3. `piggybank-frontend/` (Web3 dApp)
- **Framework:** Next.js 14 App Router + Tailwind CSS
- **Hosting:** Vercel
- **Integration:** Ethers.js for wallet connectivity (MetaMask) and direct contract interactions (approvals, emergency withdraws, manual claims).
- **UX:** Highly responsive glassmorphism UI. Data is fetched instantly from the Render API rather than making slow RPC calls, providing a web2-like experience.

## 💻 Getting Started (Local Development)

### 1. Smart Contracts
```bash
cd piggybank
forge install
forge build
```

### 2. Backend Indexer
```bash
cd piggybank-indexer
pnpm install
```
Create a `.env` file and supply:
```env
KEEPER_PRIVATE_KEY=your_bot_private_key
DATABASE_URL=postgresql://your_postgres_pooler_url
```
Start the indexer:
```bash
pnpm ts-node src/server.ts
```
*The indexer will start on `http://localhost:3001`, connect to Postgres, and begin syncing blocks.*

### 3. Frontend dApp
```bash
cd piggybank-frontend
pnpm install
pnpm dev
```
*The web interface will be available at `http://localhost:3000`.*

## 🛣️ V2 Roadmap (Next Objectives)

We are currently planning the next major iteration of PiggyBank with the following MVP 2 features:
1. **Multiple Stablecoins**: Dynamic decimal handling for various tokens natively within the frontend UI.
2. **Yield Integration**: Integrating a yield-bearing platform (e.g., Aave/Compound equivalent on Electroneum) so user deposits earn interest while locked in the PiggyBank.
3. **Decentralized Keepers**: Migrating from a centralized node keeper to a decentralized automation network (e.g. Gelato Network or Chainlink Keepers).

---
Built for the Electroneum African Builders Program.
