// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────────────────────
// PiggyBank Protocol — v1
//
// SECURITY NOTICE: This contract is UNAUDITED. It has been reviewed with static
// analysis (Slither) but has not undergone a formal security audit. User funds
// are locked until plan completion or emergency withdrawal. Use at your own risk.
//
// Target chain: Electroneum (EVM-compatible). Verify RPC, chain ID, and block
// explorer at deployment — do not assume values from memory.
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Custom Errors
// ─────────────────────────────────────────────────────────────────────────────

error TokenNotAccepted(address token);
error GoalMustBeGreaterThanZero();
error InsufficientApproval(uint256 required, uint256 actual);
error PlanNotActive(uint256 planId);
error PlanAlreadyCompleted(uint256 planId);
error RoundAlreadyFulfilled(uint256 planId, uint256 roundIndex);
error NotPlanOwner(uint256 planId, address caller);
error PlanNotEligibleForCompletion(uint256 planId);
error FeeBpsOutOfBounds(uint256 provided, uint256 min, uint256 max);
error ZeroAddress();
error InvalidPlanId(uint256 planId);

// ─────────────────────────────────────────────────────────────────────────────
// PiggyBank
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title PiggyBank
 * @notice Decentralised automated savings protocol on Electroneum.
 *
 * Users create a savings plan with a goal amount (G) and a cadence
 * (daily / weekly / monthly). The protocol deducts one round per period
 * via a permissionless `deduct()` call. Missed rounds incur a 1% fee and are
 * caught up in a single transferFrom. Funds are held in escrow and released
 * to the user on completion. Emergency withdrawal is available at any time
 * with a fee fixed at plan creation.
 *
 * Core math invariants (must never be broken):
 *   - requiredApproval = G + G/100  (covers worst-case all-rounds-missed fees)
 *   - feePerRound_i   = roundAmount_i / 100  (1% of that round's amount)
 *   - sum(roundAmounts) == G  exactly (last round absorbs integer remainder)
 *   - emergencyFeeBps is read from the Plan struct, NEVER from the global default
 */
contract PiggyBank is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    enum Cadence {
        Daily,   // period = 1 day
        Weekly,  // period = 7 days
        Monthly  // period = 30 days (rolling — avoids leap-year / Feb edge cases)
    }

    struct Plan {
        address owner;
        address token;
        uint256 goal;                 // G: total target amount (token's smallest unit)
        uint256 totalRounds;          // N: total number of periods
        uint256 roundAmount;          // G / N (standard rounds; integer division)
        uint256 lastRoundAmount;      // G - roundAmount*(N-1) — absorbs remainder
        uint256 periodLength;         // seconds: 1 days / 7 days / 30 days
        uint256 planStart;            // block.timestamp at createPlan()
        uint256 currentRoundIndex;    // 0-indexed; next round to be fulfilled
        uint256 currentRoundDeadline; // timestamp by which currentRoundIndex is due
        uint256 emergencyFeeBps;      // basis points, FIXED at creation — never re-read from global
        uint256 amountSaved;          // cumulative principal saved (NEVER includes fees)
        uint256 feesPaid;             // cumulative fees paid (NEVER includes principal)
        bool active;
        bool completed;               // true only when goal reached — NOT when exited early
    }

    struct RoundRecord {
        uint256 roundIndex;
        uint256 dueTimestamp;
        uint256 paidTimestamp; // 0 if not yet paid
        uint256 amountPaid;    // principal for this round (does not include fee)
        uint256 feeCharged;    // 0 if paid on time
        bool fulfilled;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public nextPlanId;

    /// @notice All plans by planId
    mapping(uint256 => Plan) public plans;

    /// @notice Per-round records: planId => roundIndex => RoundRecord
    mapping(uint256 => mapping(uint256 => RoundRecord)) public roundHistory;

    /// @notice All planIds owned by a user (multi-plan support)
    mapping(address => uint256[]) public userPlanIds;

    /// @notice Accepted ERC20 stablecoins (admin-managed whitelist)
    mapping(address => bool) public acceptedTokens;

    /// @notice Treasury receives all fees (net of keeper incentive)
    address public treasury;

    /// @notice Default emergency withdrawal fee for new plans (basis points)
    uint256 public defaultEmergencyFeeBps;

    /// @notice Keeper incentive as a % of collected missed-round fee (basis points)
    uint256 public keeperIncentiveBps;

    // Fee bounds
    uint256 public constant MIN_EMERGENCY_FEE_BPS = 100;  // 1%
    uint256 public constant MAX_EMERGENCY_FEE_BPS = 1000; // 10%

    // Period lengths in seconds
    uint256 private constant DAILY   = 1 days;
    uint256 private constant WEEKLY  = 7 days;
    uint256 private constant MONTHLY = 30 days;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event PlanCreated(
        uint256 indexed planId,
        address indexed owner,
        address indexed token,
        string title,
        uint256 goal,
        Cadence cadence,
        uint256 roundAmount,
        uint256 lastRoundAmount,
        uint256 totalRounds,
        uint256 emergencyFeeBps,
        uint256 requiredApproval
    );

    event RoundPaid(
        uint256 indexed planId,
        uint256 indexed roundIndex,
        uint256 amountPaid,
        uint256 feeCharged,
        bool wasMissed
    );

    event CatchUpExecuted(
        uint256 indexed planId,
        uint256 roundsRecovered,
        uint256 totalFeesCharged,
        address indexed keeper
    );

    event PlanCompleted(
        uint256 indexed planId,
        address indexed owner,
        uint256 totalSaved
    );

    event EmergencyWithdrawn(
        uint256 indexed planId,
        address indexed owner,
        uint256 amountReturned,
        uint256 feeCharged
    );

    event TokenAcceptanceChanged(address indexed token, bool accepted);
    event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);
    event DefaultEmergencyFeeBpsChanged(uint256 oldBps, uint256 newBps);
    event KeeperIncentiveBpsChanged(uint256 oldBps, uint256 newBps);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param _treasury         Address that receives protocol fees
     * @param _defaultEmerFee   Default emergency withdrawal fee in bps (e.g. 500 = 5%)
     * @param _keeperIncentive  Keeper incentive as bps of collected missed-round fee
     */
    constructor(
        address _treasury,
        uint256 _defaultEmerFee,
        uint256 _keeperIncentive
    ) Ownable(msg.sender) {
        if (_treasury == address(0)) revert ZeroAddress();
        if (_defaultEmerFee < MIN_EMERGENCY_FEE_BPS || _defaultEmerFee > MAX_EMERGENCY_FEE_BPS) {
            revert FeeBpsOutOfBounds(_defaultEmerFee, MIN_EMERGENCY_FEE_BPS, MAX_EMERGENCY_FEE_BPS);
        }
        treasury = _treasury;
        defaultEmergencyFeeBps = _defaultEmerFee;
        keeperIncentiveBps = _keeperIncentive;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: Plan Creation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Create a new savings plan.
     *
     * The user must have called `token.approve(address(this), requiredApproval)`
     * before calling this function. `requiredApproval = goal + goal/100` (≈1.01×G).
     * This buffer is mathematically sufficient to cover the worst case where every
     * single round is missed and penalised — do not alter the approval formula
     * without re-deriving the invariant.
     *
     * Round 1 funds are NOT pulled here — they are pulled on the first `deduct()` call.
     *
     * @param token   Whitelisted ERC20 stablecoin address
     * @param goal    Total savings target in token's smallest unit
     * @param cadence Daily / Weekly / Monthly
     * @return planId The ID of the newly created plan
     */
    function createPlan(
        address token,
        uint256 goal,
        Cadence cadence,
        string calldata title
    ) external returns (uint256 planId) {
        if (!acceptedTokens[token]) revert TokenNotAccepted(token);
        if (goal == 0) revert GoalMustBeGreaterThanZero();

        // Scope block: limit local variables to reduce Yul stack pressure
        {
            uint256 requiredApproval = goal + goal / 100;
            uint256 actualAllowance  = IERC20(token).allowance(msg.sender, address(this));
            if (actualAllowance < requiredApproval) {
                revert InsufficientApproval(requiredApproval, actualAllowance);
            }
        }

        planId = nextPlanId++;

        _storePlan(planId, token, goal, cadence);

        userPlanIds[msg.sender].push(planId);

        // Emit event — read computed values back from storage to avoid extra locals
        Plan storage p = plans[planId];
        emit PlanCreated(
            planId,
            msg.sender,
            token,
            title,
            goal,
            cadence,
            p.roundAmount,
            p.lastRoundAmount,
            p.totalRounds,
            p.emergencyFeeBps,
            goal + goal / 100
        );
    }

    /**
     * @dev Writes the new Plan and initial RoundRecord to storage.
     *      Extracted from createPlan to reduce local variable count in the parent frame.
     */
    function _storePlan(uint256 planId, address token, uint256 goal, Cadence cadence) internal {
        uint256 N          = _totalRounds(cadence);
        uint256 roundAmt   = goal / N;
        uint256 lastAmt    = goal - (roundAmt * (N - 1));
        uint256 periodLen  = _periodLength(cadence);
        uint256 deadline   = block.timestamp + periodLen;
        uint256 emerFee    = defaultEmergencyFeeBps;

        plans[planId] = Plan({
            owner: msg.sender,
            token: token,
            goal: goal,
            totalRounds: N,
            roundAmount: roundAmt,
            lastRoundAmount: lastAmt,
            periodLength: periodLen,
            planStart: block.timestamp,
            currentRoundIndex: 0,
            currentRoundDeadline: deadline,
            emergencyFeeBps: emerFee,
            amountSaved: 0,
            feesPaid: 0,
            active: true,
            completed: false
        });

        roundHistory[planId][0] = RoundRecord({
            roundIndex: 0,
            dueTimestamp: deadline,
            paidTimestamp: 0,
            amountPaid: 0,
            feeCharged: 0,
            fulfilled: false
        });
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Core: Deduction
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Trigger a round deduction for a plan. Permissionless — callable by
     * the plan owner, the protocol's own cron/Chainlink Automation, or any
     * third-party keeper bot.
     *
     * On-time (block.timestamp <= currentRoundDeadline):
     *   - Pulls `roundAmount` (or `lastRoundAmount` for the final round), no fee.
     *
     * Late / catch-up (block.timestamp > currentRoundDeadline):
     *   - Counts all missed rounds since last fulfillment.
     *   - Pulls (missedRounds × (roundAmount + fee)) + currentRoundAmount in one
     *     transferFrom.
     *   - Marks each round individually in `roundHistory`.
     *   - If caller is not plan owner, pays a keeper incentive from collected fees.
     *
     * @param planId The plan to deduct for
     */
    function deduct(uint256 planId) external nonReentrant {
        Plan storage plan = _activePlan(planId);

        uint256 idx = plan.currentRoundIndex;

        // Idempotency guard
        if (roundHistory[planId][idx].fulfilled) {
            revert RoundAlreadyFulfilled(planId, idx);
        }

        bool isOnTime = block.timestamp <= plan.currentRoundDeadline;

        if (isOnTime) {
            _deductOnTime(planId, plan, idx);
        } else {
            _deductCatchUp(planId, plan, idx);
        }

        // Auto-check completion after every successful deduct
        _checkAndMarkComplete(planId, plan);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: Completion
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Release accumulated savings to the plan owner. Permissionless.
     * Only callable once all rounds are fulfilled and the plan is not yet
     * marked as completed.
     *
     * @param planId The plan to complete
     */
    function claimCompletion(uint256 planId) external nonReentrant {
        if (planId >= nextPlanId) revert InvalidPlanId(planId);
        Plan storage plan = plans[planId];

        if (!plan.active) revert PlanNotActive(planId);
        if (plan.completed) revert PlanAlreadyCompleted(planId);
        if (plan.currentRoundIndex < plan.totalRounds) {
            revert PlanNotEligibleForCompletion(planId);
        }

        _releaseSavings(planId, plan);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: Emergency Withdrawal
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Exit a plan early, forfeiting the emergency withdrawal fee.
     * Only callable by the plan owner.
     *
     * The fee percentage is the value FIXED at plan creation time (stored in
     * `plan.emergencyFeeBps`) — NEVER the current global default. This is the
     * core immutability guarantee; do not read `defaultEmergencyFeeBps` here.
     *
     * @param planId The plan to exit
     */
    function emergencyWithdraw(uint256 planId) external nonReentrant {
        Plan storage plan = _activePlan(planId);
        if (plan.owner != msg.sender) revert NotPlanOwner(planId, msg.sender);

        uint256 saved = plan.amountSaved;

        // Read fee from plan struct — NEVER from global default (immutability guarantee)
        uint256 feeAmount = (saved * plan.emergencyFeeBps) / 10_000;
        uint256 returnAmount = saved - feeAmount;

        // Effects before interactions (CEI pattern)
        plan.active = false;
        plan.completed = false; // distinguishable from successful completion
        plan.amountSaved = 0;

        // Interactions
        address token = plan.token;
        address owner = plan.owner;

        if (returnAmount > 0) {
            IERC20(token).safeTransfer(owner, returnAmount);
        }
        if (feeAmount > 0) {
            IERC20(token).safeTransfer(treasury, feeAmount);
        }

        emit EmergencyWithdrawn(planId, owner, returnAmount, feeAmount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Whitelist or de-list an ERC20 stablecoin. Only affects NEW plans.
     */
    function setAcceptedToken(address token, bool accepted) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        acceptedTokens[token] = accepted;
        emit TokenAcceptanceChanged(token, accepted);
    }

    /**
     * @notice Update the treasury address. Effective immediately for all fee transfers.
     */
    function setTreasuryAddress(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, newTreasury);
        treasury = newTreasury;
    }

    /**
     * @notice Update the default emergency withdrawal fee for NEW plans only.
     * Existing plans are unaffected (their fee is stored in the Plan struct).
     * Bounds: 1% (100 bps) to 10% (1000 bps).
     */
    function setDefaultEmergencyFeeBps(uint256 newBps) external onlyOwner {
        if (newBps < MIN_EMERGENCY_FEE_BPS || newBps > MAX_EMERGENCY_FEE_BPS) {
            revert FeeBpsOutOfBounds(newBps, MIN_EMERGENCY_FEE_BPS, MAX_EMERGENCY_FEE_BPS);
        }
        emit DefaultEmergencyFeeBpsChanged(defaultEmergencyFeeBps, newBps);
        defaultEmergencyFeeBps = newBps;
    }

    /**
     * @notice Update the keeper incentive percentage (bps of collected missed-round fee).
     * Capped at 5000 bps (50%) to protect treasury revenue.
     */
    function setKeeperIncentiveBps(uint256 newBps) external onlyOwner {
        if (newBps > 5000) revert FeeBpsOutOfBounds(newBps, 0, 5000);
        emit KeeperIncentiveBpsChanged(keeperIncentiveBps, newBps);
        keeperIncentiveBps = newBps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Get all plan IDs for a given user address.
     */
    function getUserPlanIds(address user) external view returns (uint256[] memory) {
        return userPlanIds[user];
    }

    /**
     * @notice Get a round record for a given plan and round index.
     */
    function getRoundRecord(uint256 planId, uint256 roundIndex)
        external
        view
        returns (RoundRecord memory)
    {
        return roundHistory[planId][roundIndex];
    }

    /**
     * @notice Compute the required approval amount for a prospective plan.
     * Call this from the frontend before asking the user to approve.
     *
     * @param goal The target savings goal
     * @return requiredApproval goal + goal/100 (1.01 × G, integer-safe)
     */
    function computeRequiredApproval(uint256 goal) external pure returns (uint256) {
        return goal + goal / 100;
    }

    /**
     * @notice Preview plan parameters before creating: rounds, per-round amount,
     * last round amount, and required approval.
     */
    function previewPlan(uint256 goal, Cadence cadence)
        external
        pure
        returns (
            uint256 totalRounds,
            uint256 roundAmount,
            uint256 lastRoundAmount,
            uint256 requiredApproval
        )
    {
        if (goal == 0) revert GoalMustBeGreaterThanZero();
        totalRounds = _totalRounds(cadence);
        roundAmount = goal / totalRounds;
        lastRoundAmount = goal - (roundAmount * (totalRounds - 1));
        requiredApproval = goal + goal / 100;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: Deduction Paths
    // ─────────────────────────────────────────────────────────────────────────

    function _deductOnTime(uint256 planId, Plan storage plan, uint256 idx) internal {
        uint256 amt = _roundAmountFor(plan, idx);

        // Effects
        RoundRecord storage rec = roundHistory[planId][idx];
        rec.fulfilled = true;
        rec.paidTimestamp = block.timestamp;
        rec.amountPaid = amt;
        rec.feeCharged = 0;

        plan.amountSaved += amt;
        plan.currentRoundIndex = idx + 1;

        // Advance deadline for next round
        if (idx + 1 < plan.totalRounds) {
            uint256 nextDeadline = plan.currentRoundDeadline + plan.periodLength;
            plan.currentRoundDeadline = nextDeadline;
            _initNextRoundRecord(planId, idx + 1, nextDeadline);
        }

        // Interaction
        IERC20(plan.token).safeTransferFrom(plan.owner, address(this), amt);

        emit RoundPaid(planId, idx, amt, 0, false);
    }

    function _deductCatchUp(uint256 planId, Plan storage plan, uint256 idx) internal {
        _doCatchUpEffects(planId, plan, idx);
    }

    function _doCatchUpEffects(uint256 planId, Plan storage plan, uint256 startIdx) internal {
        uint256 deadline   = plan.currentRoundDeadline;
        uint256 periodLen  = plan.periodLength;
        uint256 totalRds   = plan.totalRounds;

        // If we are here, block.timestamp > deadline.
        // Number of missed deadlines = 1 + floor((elapsed - 1) / periodLen)
        uint256 missedRounds = ((block.timestamp - deadline - 1) / periodLen) + 1;
        {
            uint256 remaining = totalRds - startIdx;
            if (missedRounds >= remaining) missedRounds = remaining - 1;
        }
        uint256 roundsToProcess = missedRounds + 1;

        (uint256 principal, uint256 fees) =
            _processRounds(
                planId,
                plan.roundAmount,
                plan.lastRoundAmount,
                totalRds - 1,      // lastIdx
                startIdx,
                missedRounds,      // missedCount
                roundsToProcess,   // processCount
                deadline,          // firstDeadline
                periodLen
            );

        // Effects
        plan.amountSaved += principal;
        plan.feesPaid    += fees;
        plan.currentRoundIndex = startIdx + roundsToProcess;

        uint256 newDeadline = deadline + (roundsToProcess * periodLen);
        plan.currentRoundDeadline = newDeadline;
        if (plan.currentRoundIndex < totalRds) {
            _initNextRoundRecord(planId, plan.currentRoundIndex, newDeadline);
        }

        // Interactions
        _doCatchUpTransfers(plan, planId, missedRounds, principal, fees);
    }

    function _doCatchUpTransfers(
        Plan storage plan,
        uint256 planId,
        uint256 missedRounds,
        uint256 principal,
        uint256 fees
    ) internal {
        uint256 keeperCut;
        uint256 treasuryCut = fees;
        address sender = msg.sender;

        if (sender != plan.owner && fees > 0) {
            keeperCut   = (fees * keeperIncentiveBps) / 10_000;
            treasuryCut = fees - keeperCut;
        }

        address token = plan.token;
        address owner = plan.owner;

        IERC20(token).safeTransferFrom(owner, address(this), principal + fees);

        if (treasuryCut > 0) IERC20(token).safeTransfer(treasury,  treasuryCut);
        if (keeperCut   > 0) IERC20(token).safeTransfer(sender,    keeperCut);

        emit CatchUpExecuted(planId, missedRounds, fees, sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: Completion
    // ─────────────────────────────────────────────────────────────────────────

    function _checkAndMarkComplete(uint256 planId, Plan storage plan) internal {
        if (plan.currentRoundIndex >= plan.totalRounds && plan.active && !plan.completed) {
            _releaseSavings(planId, plan);
        }
    }

    function _releaseSavings(uint256 planId, Plan storage plan) internal {
        uint256 saved = plan.amountSaved;
        address owner = plan.owner;
        address token = plan.token;

        // Effects before interactions
        plan.completed = true;
        plan.active = false;
        plan.amountSaved = 0;

        // Interaction
        if (saved > 0) {
            IERC20(token).safeTransfer(owner, saved);
        }

        emit PlanCompleted(planId, owner, saved);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _activePlan(uint256 planId) internal view returns (Plan storage plan) {
        if (planId >= nextPlanId) revert InvalidPlanId(planId);
        plan = plans[planId];
        if (!plan.active) revert PlanNotActive(planId);
        if (plan.completed) revert PlanAlreadyCompleted(planId);
    }

    /// @dev Returns the round amount for a given round index,
    ///      using lastRoundAmount for the final round.
    function _roundAmountFor(Plan storage plan, uint256 idx) internal view returns (uint256) {
        return (idx == plan.totalRounds - 1) ? plan.lastRoundAmount : plan.roundAmount;
    }

    /// @dev Initialises the RoundRecord for the next upcoming round.
    function _initNextRoundRecord(uint256 planId, uint256 idx, uint256 deadline) internal {
        roundHistory[planId][idx] = RoundRecord({
            roundIndex: idx,
            dueTimestamp: deadline,
            paidTimestamp: 0,
            amountPaid: 0,
            feeCharged: 0,
            fulfilled: false
        });
    }

    /**
     * @dev Writes RoundRecord entries for all rounds in a catch-up call and
     *      returns the total principal and fees.
     *      Parameters deliberately minimised to avoid EVM 16-variable stack limit.
     */
    function _processRounds(
        uint256 planId,
        uint256 roundAmt,
        uint256 lastRoundAmt,
        uint256 lastIdx,       // totalRounds - 1 — pre-computed by caller
        uint256 startIdx,
        uint256 missedCount,   // number of missed (fee-bearing) rounds
        uint256 processCount,  // total rounds to process (missed + 1 current)
        uint256 firstDeadline, // deadline of the first round being processed
        uint256 periodLen
    ) internal returns (uint256 totalPrincipal, uint256 totalFees) {
        for (uint256 i = 0; i < processCount; i++) {
            uint256 rIdx = startIdx + i;
            uint256 rAmt = (rIdx == lastIdx) ? lastRoundAmt : roundAmt;
            uint256 fee  = (i < missedCount) ? rAmt / 100 : 0;

            totalPrincipal += rAmt;
            totalFees      += fee;

            _writeRoundRecord(planId, rIdx, firstDeadline + (i * periodLen), rAmt, fee);
            emit RoundPaid(planId, rIdx, rAmt, fee, i < missedCount);
        }
    }

    /// @dev Writes a single RoundRecord to storage. Extracted to reduce stack depth.
    function _writeRoundRecord(
        uint256 planId,
        uint256 rIdx,
        uint256 dueTs,
        uint256 rAmt,
        uint256 fee
    ) internal {
        RoundRecord storage rec = roundHistory[planId][rIdx];
        rec.roundIndex   = rIdx;
        rec.dueTimestamp = dueTs;
        rec.fulfilled    = true;
        rec.paidTimestamp = block.timestamp;
        rec.amountPaid   = rAmt;
        rec.feeCharged   = fee;
    }

    /// @dev Total number of rounds for a given cadence.
    ///      v1 uses fixed durations: Daily=30, Weekly=12, Monthly=12.
    function _totalRounds(Cadence cadence) internal pure returns (uint256) {
        if (cadence == Cadence.Daily)   return 30;
        if (cadence == Cadence.Weekly)  return 12;
        return 12; // Monthly
    }

    function _periodLength(Cadence cadence) internal pure returns (uint256) {
        if (cadence == Cadence.Daily)   return DAILY;
        if (cadence == Cadence.Weekly)  return WEEKLY;
        return MONTHLY;
    }
}

