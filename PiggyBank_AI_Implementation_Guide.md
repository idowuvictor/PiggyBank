---
name: piggybank-protocol-builder
description: Full implementation guide for the PiggyBank automated savings protocol on Electroneum (EVM-compatible chain). Use this to build the smart contracts, off-chain automation/keeper layer, indexer/backend, and frontend dApp exactly as specified. Covers plan creation, scheduled/permissionless deduction with catch-up + fees, escrow, emergency withdrawal, and completion. Read fully before writing any code — the fee/approval math has exact invariants that must hold.
---

# PiggyBank Protocol — AI Implementation Guide

This document is the complete build spec for PiggyBank v1. Follow it exactly — several numbers here (fee %, approval formula) are **fixed product decisions**, not suggestions, and the contract is unsafe if they're altered without re-deriving the invariants in Section 2.

Read this entire file before writing code. Then work top-to-bottom: contracts → tests → automation layer → indexer → frontend.

---

## 0. Scope for v1

**Build:**
- Solidity smart contract(s) implementing plan creation, deduction (on-time + catch-up), completion, and emergency withdrawal
- Off-chain automation (cron-based; Chainlink Automation-compatible interface)
- Indexer/backend that reads on-chain events into a queryable history per user
- Frontend dApp: plan creation flow, dashboard, emergency withdrawal flow

**Explicitly NOT in v1** (do not build):
- Any yield/lending protocol integration
- Any cross-chain functionality
- Formal audit tooling integration beyond basic static analysis (Slither) — flag as a manual pre-launch step, don't automate it away
- Partial emergency withdrawal (v1 emergency withdrawal always closes the whole plan)

---

## 1. Chain & tooling

- Target chain: **Electroneum** (EVM-compatible). Confirm current RPC endpoints, chain ID, and block explorer before deployment — do not hardcode from memory, verify against Electroneum's current official docs at build time.
- Token: assume ERC20 (confirm which token(s) the protocol will support — a single fixed token per deployment is simplest for v1; multi-token support is a v2+ consideration unless told otherwise).
- Recommended stack: Solidity ^0.8.20+, Foundry or Hardhat for testing/deployment, OpenZeppelin contracts for ERC20 interfaces, SafeERC20, ReentrancyGuard, Ownable/AccessControl for admin functions.
- **Do not use `transfer()`/`unlimited default approvals` patterns uncritically** — use OpenZeppelin's `SafeERC20.safeTransferFrom`.

---

## 2. Core math — fixed invariants

These formulas are locked. Implement exactly as specified; do not "improve" or add buffers.

### 2.1 Rounds
```
N = plan duration / period length
```
- Daily plan: period length = 1 day
- Weekly plan: period length = 7 days
- Monthly plan: period length = 30 days (rolling, not calendar-aligned — avoids leap-year/Feb edge cases)

Per-round amount:
```
roundAmount = G / N
```
Use integer-safe division; handle remainder (see 2.4).

### 2.2 Required approval
```
Approval = G + (0.01 × (G / N) × N)
         = G + 0.01 × G
         = 1.01 × G
```
This is computed and shown to the user at plan creation. The user calls `approve()` for exactly this amount before `createPlan()` succeeds (or `createPlan()` checks `allowance >= requiredApproval` and reverts otherwise).

**Invariant to preserve:** this approval amount must always be sufficient to cover the goal plus every round's fee, even in the absolute worst case where every single round is missed and penalized. Do not add extra product-side fees or costs that draw from this same allowance without re-deriving this formula — if you do, the worst-case math breaks and `transferFrom` can start reverting on legitimate catch-up calls. If a future requirement changes this, stop and recompute the invariant before implementing.

### 2.3 Missed-round fee
```
feePerMissedRound = 0.01 × roundAmount   (i.e., 1% of G/N)
```
This exact figure is what makes the 1.01×G buffer sufficient in the worst case. Do not use a flat fee or an escalating/lateness-scaled fee unless the approval formula in 2.2 is also redesigned to match — they are mathematically coupled.

### 2.4 Rounding
- All amounts should be computed in the token's smallest unit (wei-equivalent) to avoid floating point.
- `G / N` and `1% of that` will not always divide evenly. Decide and document a consistent rounding rule (e.g., round down per round, and let the final round absorb the remainder so the sum of all rounds exactly equals G). Write a unit test asserting `sum(all round amounts across the plan) == G` exactly, and `sum(all fees across worst case) == 0.01 × G` exactly.

### 2.5 Emergency withdrawal fee
- Set per-plan at creation time, as a percentage, using whatever the protocol-wide default is **at that moment**.
- Store this value on the plan struct itself (not read from a global at withdrawal time) — this is what makes it immutable per-plan even if the global default later changes.
- Default value: 5%. Must be governance/admin-configurable for *future* plans, with bounds enforced (suggest min 1%, max 20% — confirm exact bounds with product owner before hardcoding, these weren't explicitly specified beyond "customizable").

---

## 3. Contract design

### 3.1 Suggested storage layout

```solidity
struct Plan {
    address owner;
    uint256 goal;                  // G
    uint256 totalRounds;           // N
    uint256 roundAmount;           // G / N (see rounding rule, 2.4)
    uint256 periodLength;          // in seconds: 1 days / 7 days / 30 days
    uint256 planStart;
    uint256 currentRoundIndex;     // 0-indexed, which round we're currently in
    uint256 currentRoundDeadline;  // timestamp this round is due by
    uint256 emergencyFeeBps;       // basis points, fixed at creation (e.g. 500 = 5%)
    uint256 amountSaved;           // cumulative principal saved, excludes fees
    uint256 feesPaid;              // cumulative fees paid, tracked separately from amountSaved — never conflate these
    bool    active;
    bool    completed;
}

struct RoundRecord {
    uint256 roundIndex;
    uint256 dueTimestamp;
    uint256 paidTimestamp;   // 0 if unpaid
    uint256 amountPaid;
    uint256 feeCharged;      // 0 if paid on time
    bool    fulfilled;
}
```

- `mapping(uint256 => Plan) plans;` keyed by a `planId` (incrementing counter) or `mapping(address => Plan[])` if one user can have multiple plans — confirm with product owner whether multi-plan-per-user is required; default to supporting it since it's low extra cost.
- `mapping(uint256 => mapping(uint256 => RoundRecord)) roundHistory;` — `planId => roundIndex => record`. This is required per PRD Section 5.2 — a single running total is not sufficient, per-round attribution must be reconstructable on-chain for the history/receipts UI.

### 3.2 Core functions

```solidity
function createPlan(uint256 goal, Cadence cadence, uint256 emergencyFeeBpsOverrideDefault) external returns (uint256 planId);
```
- Computes N, roundAmount, required approval.
- Checks `IERC20(token).allowance(msg.sender, address(this)) >= requiredApproval`; revert with a clear custom error if insufficient (e.g. `InsufficientApproval(uint256 required, uint256 actual)`).
- Does **not** pull any funds itself — first round's funds are collected on the first `deduct()` call, not at creation (confirm this matches product intent; alternative is to pull round 1 immediately at creation — either is defensible, but pick one and be consistent, and reflect it in `currentRoundDeadline` initialization).
- Stores plan, emits `PlanCreated(planId, owner, goal, cadence, roundAmount, totalRounds)`.

```solidity
function deduct(uint256 planId) external;
```
This is the core function — implement carefully per the PRD's exact behavior:

1. Load plan. Revert if `!active` or `completed`.
2. Determine current on-chain time vs. `currentRoundDeadline`.
3. **If the current round is already `fulfilled`:** no-op / revert with a clear reason (e.g. `RoundAlreadyFulfilled`) — this is the idempotency requirement. Do not silently succeed doing nothing if you'd rather revert; pick one behavior and document it (revert is usually cleaner for off-chain callers/bots to detect "nothing to do" vs a real failure).
4. **If `block.timestamp <= currentRoundDeadline` and round is unfulfilled (on-time case):**
   - `safeTransferFrom(owner, address(this), roundAmount)`
   - Mark round fulfilled, record in `RoundRecord` (feeCharged = 0), update `amountSaved += roundAmount`, advance `currentRoundIndex` and `currentRoundDeadline` to next round.
   - Emit `RoundPaid(planId, roundIndex, roundAmount, 0)`.
5. **If `block.timestamp > currentRoundDeadline` (missed-round / catch-up case):**
   - Compute how many full rounds have elapsed without fulfillment (could be exactly 1, could be many — no cap, per 2.3/uncapped catch-up decision).
   - For each missed round: `roundAmount + feePerMissedRound` is owed.
   - Also owed: the **current** (now-due) round's `roundAmount`, at no fee yet (it just became due).
   - **Total pulled in one `safeTransferFrom` call**: `(missedRounds × (roundAmount + feePerMissedRound)) + roundAmount`.
   - On success: mark all those rounds fulfilled individually in `RoundRecord` (this is the "correctly attribute the lump sum back to individual rounds" requirement — do not just bump one aggregate counter), update `amountSaved` (principal only) and `feesPaid` (fees only) separately, advance `currentRoundIndex`/`currentRoundDeadline` past all newly-fulfilled rounds.
   - Emit one `RoundPaid` event per round covered (so off-chain indexer can build accurate per-round history), plus one `CatchUpExecuted(planId, roundsRecovered, totalFeesCharged)` summary event.
6. Keeper incentive: if `msg.sender != planOwner`, pay a small incentive from the collected fee to `msg.sender` (see 3.4). Never pay incentive on the on-time-no-fee path (step 4) — only on successful fee collection (step 5).

```solidity
function claimCompletion(uint256 planId) external;
```
- Callable by anyone (per PRD FR-5 / permissionless pattern).
- Requires `currentRoundIndex >= totalRounds` (all rounds fulfilled) and `!completed`.
- Transfers `amountSaved` (the accumulated principal, not fees) to `plan.owner`.
- Marks `completed = true`, `active = false`.
- Emits `PlanCompleted(planId, owner, totalSaved)`.
- Decide or confirm: should the *caller* (if not the owner) receive any small completion-trigger incentive, matching the bot-incentive pattern elsewhere? Not explicitly specified in the PRD — flag to product owner; reasonable default is no fee here since there's no "penalty" being collected to fund it, unlike `deduct()`.

```solidity
function emergencyWithdraw(uint256 planId) external;
```
- Only callable by `plan.owner`.
- Requires `active && !completed`.
- Fee = `plan.emergencyFeeBps` (the value stored at creation, never the current global default).
- `feeAmount = amountSaved × emergencyFeeBps / 10000`
- Transfer `amountSaved - feeAmount` to owner, `feeAmount` to treasury.
- Mark `active = false`, `completed = false` (or add a distinct `withdrawnEarly` flag — completed should probably mean "reached goal," not "exited early"; keep these states distinguishable for the indexer/history UI).
- Emit `EmergencyWithdrawn(planId, owner, amountReturned, feeCharged)`.

### 3.3 Admin functions

```solidity
function setDefaultEmergencyFeeBps(uint256 newBps) external onlyOwner; // or onlyGovernance
function setTreasuryAddress(address newTreasury) external onlyOwner;
function setKeeperIncentiveBps(uint256 newBps) external onlyOwner; // portion of collected fee paid to caller, see 3.4
```
- Enforce bounds on `newBps` (confirm exact min/max with product owner; suggested 100–2000 bps / 1%–20% for emergency fee).
- These changes must **only** affect plans created after the change (per PRD 4.6) — since `emergencyFeeBps` is copied into the `Plan` struct at creation time and never re-read from the global afterward, this is automatically satisfied as long as you don't accidentally re-read the global at withdrawal time. **Do not "optimize" this by reading the current global default at withdrawal time — that would break the immutability guarantee.**

### 3.4 Keeper incentive split

Not fully specified in the PRD — implement as a configurable basis-points cut of the fee collected in a catch-up `deduct()` call:
```
keeperCut = totalFeesCollectedThisCall × keeperIncentiveBps / 10000
treasuryCut = totalFeesCollectedThisCall - keeperCut
```
- Only applies when `msg.sender != plan.owner` (a user triggering their own catch-up doesn't need to pay themselves an incentive — though decide: does a user calling their own missed deduct() still pay the full fee to treasury with no self-incentive? Yes — default assumption, confirm with product owner if unclear).
- Suggested starting value: something small enough not to meaningfully erode user fee revenue but large enough to cover a bot's gas cost with margin — this needs real gas-cost modeling on Electroneum before finalizing a number; do not hardcode an arbitrary percentage without that analysis.

### 3.5 Security requirements

- Use `ReentrancyGuard` on all state-changing external functions that move tokens (`deduct`, `claimCompletion`, `emergencyWithdraw`).
- Use `SafeERC20` throughout, never raw `transfer`/`transferFrom`.
- All arithmetic on 0.8.x has built-in overflow checks — do not use `unchecked` blocks unless you've specifically proven safety and commented why.
- Validate `goal > 0` and cadence is one of the three valid enum values at `createPlan`.
- Reentrancy note specific to this design: `deduct()`'s catch-up path does a single large `transferFrom` — ensure all state (round records, `currentRoundIndex`, `amountSaved`, `feesPaid`) is updated **before** any external call/incentive transfer (checks-effects-interactions pattern), not after.
- Since this is explicitly unaudited (PRD Section 8.1), run Slither (or equivalent static analyzer) as part of the build process and resolve/document every finding, even though this doesn't substitute for a real audit. Note this limitation clearly in code comments at the top of the main contract file.

---

## 4. Off-chain automation layer

### 4.1 Cron / Chainlink Automation

- Build a service (can start as a simple cron job, ideally migrated to Chainlink Automation or Gelato for decentralization/reliability) that:
  - Polls all active plans at the frequency in the table below
  - For each plan whose current round is due (or overdue) and unfulfilled, calls `deduct(planId)`
  - Logs failures (e.g., insufficient allowance edge cases, which shouldn't happen given the 2.2 invariant, but log anyway) for monitoring

| Cadence | Poll frequency |
|---|---|
| Daily plans | every 2 hours |
| Weekly plans | every 1 day |
| Monthly plans | every 7 days |

- This is the **primary** deduction path — it should always win the race against any bot, since it has no reason to wait (no incentive to delay, unlike a bot in the penalty window). Ensure the cron calls `deduct()` as soon as a round becomes due, not just at end of the polling window.
- If migrating to Chainlink Automation: implement `checkUpkeep`/`performUpkeep` per Chainlink's Automation-compatible interface, iterating over active plans (may need pagination/batching if plan count grows large — do not assume unbounded on-chain iteration in `checkUpkeep` is safe; consider maintaining an off-chain-queryable index of "plans due soon" instead of looping all plans on-chain).

### 4.2 Bot / keeper support

- No special software needs to be built by the team for third-party bots beyond documenting the `deduct()` interface and the incentive mechanics (3.4) publicly, so external keeper operators can build against it.
- Consider publishing a minimal reference keeper bot (open source) as a starting point for third parties, and to prove the incentive is economically viable before relying on external bots as a real backstop.

---

## 5. Indexer / backend

- Listen for all contract events: `PlanCreated`, `RoundPaid`, `CatchUpExecuted`, `PlanCompleted`, `EmergencyWithdrawn`.
- Build a queryable store (Postgres or similar) keyed by `planId` and `owner address`, reconstructing:
  - Full per-round history per plan (status, amount, fee, timestamp) — required for the "Round 3: paid late, fee charged" UI requirement (PRD 6.2).
  - Aggregate saved-vs-goal and fees-paid-separately figures per plan.
- Expose an API (REST or GraphQL) for the frontend to query without requiring users to run their own RPC queries.
- This is a read-model only — it must never be the source of truth for fund movement; the contract is authoritative. Treat the indexer as eventually-consistent and rebuildable from chain history at any time.
- **Note for Version 2:** The current indexer will be built using SQLite for local development and initial testing. We plan to port to PostgreSQL for production in version 2.

---

## 6. Frontend requirements

### 6.1 Plan creation flow
1. Input: goal amount, cadence selection (daily/weekly/monthly).
2. Display computed: number of rounds, per-round amount, **total required approval (1.01 × G)**, and what that buffer covers, in plain language.
3. Display the current default emergency withdrawal fee % that will be locked into this plan, with an explicit note that it will not change even if the protocol default changes later.
4. **Required explicit acknowledgment step** (checkbox or equivalent — do not bury in fine print) covering, per PRD Section 6.1:
   - Funds are locked until the deadline; emergency withdrawal is the only early exit and carries the stated fee.
   - Missed rounds compound with **no cap** — cost grows the longer the wallet goes unfunded.
   - The contract is **unaudited**.
5. Trigger `approve()` then `createPlan()`.

### 6.2 Dashboard
- Per-plan view: goal, progress (saved vs. goal, shown separately from fees paid), current round status, time remaining until current round is marked missed.
- Per-round history table/list: date, status (on-time / missed-then-caught-up / pending), amount, fee if any — sourced from the indexer (Section 5).
- Manual "save now" button that calls `deduct()` directly from the user's own wallet, for users who want to self-trigger rather than wait for cron.

### 6.3 Emergency withdrawal flow
- Show the exact fee (in token amount, not just %) computed from the plan's locked-in `emergencyFeeBps`, before final confirmation.
- Require explicit confirmation given this is an irreversible action that closes the plan.

---

## 7. Testing checklist (minimum bar before any deployment)

- [ ] Unit test: `sum(roundAmount across all N rounds) == G` exactly, for a range of G/N combinations including non-evenly-divisible cases.
- [ ] Unit test: worst-case approval sufficiency — simulate every round being missed and penalized sequentially; assert the final aggregated `transferFrom` never exceeds `1.01 × G` total pulled across the plan's lifetime.
- [ ] Unit test: idempotency — calling `deduct()` twice within the same fulfilled round has no double-charge effect.
- [ ] Unit test: catch-up correctly attributes lump-sum payment to individual `RoundRecord`s, not just an aggregate counter.
- [ ] Unit test: `amountSaved` and `feesPaid` never conflated — assert they're tracked and readable independently at every step.
- [ ] Unit test: emergency withdrawal fee uses the plan's stored `emergencyFeeBps`, unaffected by a subsequent `setDefaultEmergencyFeeBps` admin call.
- [ ] Unit test: keeper incentive only pays out on a successful fee-bearing catch-up call, never on a call that reverts or on-time no-fee calls.
- [ ] Unit test: permissionless calls — `deduct()` and `claimCompletion()` succeed when called by a non-owner address, with correct fund routing.
- [ ] Reentrancy test: attempt reentrancy via a malicious ERC20 token or receiver on all fund-moving functions.
- [ ] Fuzz test: random sequences of on-time/missed rounds across a full plan lifecycle, asserting invariants (2.2, 2.3) hold throughout.
- [ ] Run Slither (or equivalent) and resolve/document all findings before any mainnet deployment.

---

## 8. Open items requiring product-owner confirmation before/during build

These were flagged during design and are not fully pinned down — do not silently assume an answer, ask or clearly flag the assumption made:

1. Exact keeper incentive split (Section 3.4) — needs real gas-cost analysis on Electroneum.
2. Whether `createPlan()` pulls round 1 immediately or waits for the first `deduct()` call (Section 3.2).
3. Multi-plan-per-user support (Section 3.1) — assumed yes, confirm.
4. Exact min/max bounds for the emergency withdrawal fee (Section 2.5) — 1%–20% is a placeholder suggestion, not confirmed.
5. Whether `claimCompletion()` callers (when not the plan owner) receive any incentive (Section 3.2) — default assumed no.
6. Which specific ERC20 token(s) this deployment targets on Electroneum.
