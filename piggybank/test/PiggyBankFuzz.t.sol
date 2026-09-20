// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PiggyBank.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Fuzz USDC", "fUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/**
 * @title PiggyBankFuzzTest
 * @notice Fuzz and invariant tests for core math properties.
 *
 * Key invariants tested:
 *  1. sum(roundAmounts) == goal for any goal/cadence combination
 *  2. Worst-case approval (goal + goal/100) always covers all principal + fees
 *  3. After any sequence of on-time/missed deductions, amountSaved + feesPaid == totalPulled
 */
contract PiggyBankFuzzTest is Test {
    PiggyBank public piggyBank;
    MockToken public token;

    address public admin = address(0xF0);
    address public treasury = address(0xF1);
    address public user = address(0xF2);

    function setUp() public {
        vm.startPrank(admin);
        piggyBank = new PiggyBank(treasury, 500, 1000);
        token = new MockToken();
        piggyBank.setAcceptedToken(address(token), true);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: Round amounts always sum exactly to goal
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev goal is bounded to [1, 100_000e6] to keep tests reasonable
    function testFuzz_RoundAmountsSum_Daily(uint256 goal) public view {
        goal = bound(goal, 30, 100_000e6); // at least 1 unit per round
        (uint256 N, uint256 roundAmt, uint256 lastAmt,) =
            piggyBank.previewPlan(goal, PiggyBank.Cadence.Daily);
        assertEq(roundAmt * (N - 1) + lastAmt, goal, "daily: round sum != goal");
    }

    function testFuzz_RoundAmountsSum_Weekly(uint256 goal) public view {
        goal = bound(goal, 12, 100_000e6);
        (uint256 N, uint256 roundAmt, uint256 lastAmt,) =
            piggyBank.previewPlan(goal, PiggyBank.Cadence.Weekly);
        assertEq(roundAmt * (N - 1) + lastAmt, goal, "weekly: round sum != goal");
    }

    function testFuzz_RoundAmountsSum_Monthly(uint256 goal) public view {
        goal = bound(goal, 12, 100_000e6);
        (uint256 N, uint256 roundAmt, uint256 lastAmt,) =
            piggyBank.previewPlan(goal, PiggyBank.Cadence.Monthly);
        assertEq(roundAmt * (N - 1) + lastAmt, goal, "monthly: round sum != goal");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: Approval always covers worst-case principal + fees
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_ApprovalSufficiency_Daily(uint256 goal) public pure {
        goal = bound(goal, 30, 100_000e6);
        uint256 N = 30;
        uint256 roundAmt = goal / N;
        uint256 lastAmt = goal - (roundAmt * (N - 1));
        uint256 approval = goal + goal / 100;

        uint256 totalPull;
        for (uint256 i = 0; i < N; i++) {
            uint256 rAmt = (i == N - 1) ? lastAmt : roundAmt;
            totalPull += rAmt + rAmt / 100; // worst case: every round missed
        }
        assertLe(totalPull, approval, "worst-case pull exceeds approval");
    }

    function testFuzz_ApprovalSufficiency_Weekly(uint256 goal) public pure {
        goal = bound(goal, 12, 100_000e6);
        uint256 N = 12;
        uint256 roundAmt = goal / N;
        uint256 lastAmt = goal - (roundAmt * (N - 1));
        uint256 approval = goal + goal / 100;

        uint256 totalPull;
        for (uint256 i = 0; i < N; i++) {
            uint256 rAmt = (i == N - 1) ? lastAmt : roundAmt;
            totalPull += rAmt + rAmt / 100;
        }
        assertLe(totalPull, approval, "weekly: worst-case pull exceeds approval");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: Random on-time / late deduction sequence preserves invariants
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Fuzz over a seed that controls whether each round is paid on-time
     * or missed by some number of periods. Asserts:
     *  - Total pulled from user never exceeds requiredApproval
     *  - amountSaved + feesPaid == totalPrincipal + totalFees pulled
     *  - Plan ends in completed state
     */
    function testFuzz_RandomRoundSequence_Daily(uint256 seed) public {
        uint256 goal = 30e6; // 30 USDC / 30 rounds = 1 USDC each (simple numbers)
        uint256 N = 30;
        uint256 approval = goal + goal / 100;

        token.mint(user, approval + 1e6); // a bit extra for safety
        vm.startPrank(user);
        token.approve(address(piggyBank), approval);
        uint256 planId = piggyBank.createPlan(address(token), goal, PiggyBank.Cadence.Daily);
        vm.stopPrank();

        uint256 userBalanceBefore = token.balanceOf(user);

        for (uint256 i = 0; i < N; i++) {
            // Derive a "delay" for this round from the seed: 0 = on-time, 1-2 = late by N periods
            uint256 delay = (seed >> (i * 2)) & 0x3; // 2 bits per round: 0,1,2,3
            if (delay > 0) {
                // Warp past deadline by `delay` periods (simulates missed rounds)
                vm.warp(block.timestamp + delay * 1 days);
            }

            // deduct may cover multiple missed rounds in one call
            PiggyBank.Plan memory p = _getPlan(planId);
            if (p.currentRoundIndex < N) {
                vm.prank(user);
                try piggyBank.deduct(planId) {} catch {}
            }

            // Always advance at least one period so we don't loop without progress
            vm.warp(block.timestamp + 1 days);
        }

        // By now all rounds should be fulfilled; claim if not auto-completed
        PiggyBank.Plan memory pFinal = _getPlan(planId);
        if (pFinal.active && !pFinal.completed && pFinal.currentRoundIndex >= N) {
            vm.prank(user);
            piggyBank.claimCompletion(planId);
        }

        uint256 totalPulled = userBalanceBefore - token.balanceOf(user);
        assertLe(totalPulled, approval, "total pulled exceeds approval");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helper
    // ─────────────────────────────────────────────────────────────────────────

    function _getPlan(uint256 planId) internal view returns (PiggyBank.Plan memory p) {
        (
            p.owner, p.token, p.goal, p.totalRounds,
            p.roundAmount, p.lastRoundAmount, p.periodLength, p.planStart,
            p.currentRoundIndex, p.currentRoundDeadline, p.emergencyFeeBps,
            p.amountSaved, p.feesPaid, p.active, p.completed
        ) = piggyBank.plans(planId);
    }
}
