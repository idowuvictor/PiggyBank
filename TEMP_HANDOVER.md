# AI Handover Context: PiggyBank 🐷

**To the Next AI Agent:**
The user has just migrated this project into its own dedicated workspace. Below is the complete context of the project, architecture, and current state so you can pick up exactly where I left off without needing to ask the user any redundant questions.

---

## 1. Project Overview
**PiggyBank** is a decentralized, automated savings protocol built on the **Electroneum blockchain (Testnet)**. 
- **Goal:** Users create a savings plan to reach a financial goal, approve their tokens once, and monitor every scheduled payment/deduction until completion.
- **Live Demo:** `https://piggybank-ashy.vercel.app`
- **Wallet Connection:** Ethers.js using injected provider (MetaMask). 

## 2. Technical Stack & Architecture
The project is split into three distinct directories:

### A. Smart Contracts (`/piggybank`)
- **Framework:** Foundry
- **Core Contract:** `PiggyBank.sol` handles plan creation, scheduled deductions, and claims.
- **Testing:** `MockERC20.sol` is currently used as a stand-in for USDC.
- **Status:** Deployed on Electroneum Testnet. Math invariants and catch-up deductions are fully implemented.

### B. Backend Indexer (`/piggybank-indexer`)
- **Stack:** Node.js, Express, SQLite (`better-sqlite3`), Ethers.js
- **Purpose:** Listens to `PlanCreated` and `RoundPaid` events from the blockchain to keep a local database fully synced.
- **API:** Exposes a lightning-fast REST API (`http://localhost:3001/api/plans/:address`) so the frontend doesn't have to loop RPC calls to the blockchain. 
- **Status:** Fully functional. Calculates `nextPayment` timestamps and `active`/`completed` statuses on-the-fly.

### C. Frontend (`/piggybank-frontend`)
- **Stack:** Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons.
- **Purpose:** Dashboard for users to create and manage their savings plans.
- **Recent Fixes:** The dashboard now fetches plan data from the Indexer API instead of the blockchain. It also features a sleek UI dropdown in the "Available Balance" card that lets the user seamlessly toggle between their native **ETN** balance and their **USDC** balance.

---

## 3. V2 Roadmap & Next Objectives
The user has specifically requested the following features for V2 (MVP 2). Prioritize these tasks when the user is ready to proceed:

1. **Multiple Stablecoins:** The protocol currently hardcodes deposits to USDC. We need to refactor the contracts and UI to support multiple stablecoins.
2. **Yield Integration:** Integrate a yield-bearing platform (e.g., Aave/Compound equivalent on Electroneum) so user deposits earn interest while locked in the PiggyBank.
3. **PostgreSQL Migration:** Migrate the backend indexer database from SQLite to PostgreSQL for production readiness.

## 4. Current State & Known Quirks
- **Decimals:** The frontend hooks correctly differentiate between 18 decimals for ETN and the token decimals for USDC. (Note: the `MockERC20` used on testnet currently happens to have 18 decimals, but the code dynamically fetches it in preparation for a 6-decimal stablecoin).
- **Network Switching:** The frontend automatically prompts the user to switch to the Electroneum Testnet (`Chain ID: 5201420`) if they are on the wrong network.

**You are now fully up to speed. Greet the user and ask them which V2 roadmap item they'd like to tackle first!**
