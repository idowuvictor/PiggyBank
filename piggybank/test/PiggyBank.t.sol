// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PiggyBank.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Mock ERC20 stablecoin
// ─────────────────────────────────────────────────────────────────────────────

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
}

// ─────────────────────────────────────────────────────────────────────────────
// PiggyBank Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

contract PiggyBankTest is Test {
    PiggyBank public piggyBank;
    MockUSDC public usdc;

    address public admin    = address(0xA0);
    address public treasury = address(0xA1);
    address public alice    = address(0xA2); // plan owner
    address public bob      = address(0xA3); // keeper / third party

    uint256 constant DEFAULT_EMERGENCY_FEE_BPS  = 500;  // 5%
    uint256 constant DEFAULT_KEEPER_INCENTIVE   = 1000; // 10%

    // ─────────────────────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.startPrank(admin);
        piggyBank = new PiggyBank(treasury, DEFAULT_EMERGENCY_FEE_BPS, DEFAULT_KEEPER_INCENTIVE);
        usdc = new MockUSDC();
        piggyBank.setAcceptedToken(address(usdc), true);
        vm.stopPrank();

        usdc.mint(alice, 10_000e6);
        usdc.mint(bob, 1_000e6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper — wraps public mapping into a Plan struct
    // ─────────────────────────────────────────────────────────────────────────

    function _plan(uint256 planId) internal view returns (PiggyBank.Plan memory p) {
        (
            p.owner, p.token, p.goal, p.totalRounds,
            p.roundAmount, p.lastRoundAmount, p.periodLength, p.planStart,
            p.currentRoundIndex, p.currentRoundDeadline, p.emergencyFeeBps,
            p.amountSaved, p.feesPaid, p.active, p.completed
        ) = piggyBank.plans(planId);
    }

    function _createPlan(address user, uint256 goal, PiggyBank.Cadence cadence)
        internal returns (uint256 planId)
    {
        uint256 approval = goal + goal / 100;
        vm.startPrank(user);
        usdc.approve(address(piggyBank), approval);
        planId = piggyBank.createPlan(address(usdc), goal, cadence, "Test Plan");
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Plan creation
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreatePlan_Daily() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);
        assertEq(planId, 0);

        PiggyBank.Plan memory p = _plan(planId);
        assertEq(p.owner, alice);
        assertEq(p.token, address(usdc));
        assertEq(p.goal, goal);
        assertEq(p.totalRounds, 30);
        assertEq(p.roundAmount, goal / 30);
        assertEq(p.lastRoundAmount, goal - (p.roundAmount * 29));
        assertTrue(p.active);
        assertFalse(p.completed);
    }

    function test_CreatePlan_RevertsIfTokenNotAccepted() public {
        address fakeToken = address(0xDEAD);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(TokenNotAccepted.selector, fakeToken));
        piggyBank.createPlan(fakeToken, 100e6, PiggyBank.Cadence.Daily, "Test Plan");
        vm.stopPrank();
    }

    function test_CreatePlan_RevertsIfGoalZero() public {
        vm.startPrank(alice);
        usdc.approve(address(piggyBank), 1e6);
        vm.expectRevert(GoalMustBeGreaterThanZero.selector);
        piggyBank.createPlan(address(usdc), 0, PiggyBank.Cadence.Daily, "Test Plan");
        vm.stopPrank();
    }

    function test_CreatePlan_RevertsIfInsufficientApproval() public {
        uint256 goal = 100e6;
        uint256 required = goal + goal / 100;
        vm.startPrank(alice);
        usdc.approve(address(piggyBank), required - 1);
        vm.expectRevert(abi.encodeWithSelector(InsufficientApproval.selector, required, required - 1));
        piggyBank.createPlan(address(usdc), goal, PiggyBank.Cadence.Daily, "Test Plan");
        vm.stopPrank();
    }

    function test_CreatePlan_DoesNotPullFundsAtCreation() public {
        uint256 aliceBefore = usdc.balanceOf(alice);
        _createPlan(alice, 300e6, PiggyBank.Cadence.Daily);
        assertEq(usdc.balanceOf(alice), aliceBefore, "no funds should be pulled at creation");
        assertEq(usdc.balanceOf(address(piggyBank)), 0);
    }

    function test_MultiPlan_UserCanHaveMultiplePlans() public {
        uint256 planId0 = _createPlan(alice, 300e6, PiggyBank.Cadence.Daily);
        vm.startPrank(alice);
        usdc.approve(address(piggyBank), 1200e6 + 1200e6 / 100);
        uint256 planId1 = piggyBank.createPlan(address(usdc), 1200e6, PiggyBank.Cadence.Weekly, "Test Plan");
        vm.stopPrank();

        assertEq(planId0, 0);
        assertEq(planId1, 1);

        uint256[] memory ids = piggyBank.getUserPlanIds(alice);
        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Round amounts sum to goal exactly
    // ─────────────────────────────────────────────────────────────────────────

    function test_RoundAmountsSum_DailyEvenDivision() public view {
        (uint256 N, uint256 roundAmt, uint256 lastAmt,) =
            piggyBank.previewPlan(300e6, PiggyBank.Cadence.Daily);
        assertEq(roundAmt * (N - 1) + lastAmt, 300e6, "sum != goal (even)");
    }

    function test_RoundAmountsSum_DailyWithRemainder() public view {
        uint256 goal = 301e6;
        (uint256 N, uint256 roundAmt, uint256 lastAmt,) =
            piggyBank.previewPlan(goal, PiggyBank.Cadence.Daily);
        assertEq(roundAmt * (N - 1) + lastAmt, goal, "sum != goal (remainder)");
    }

    function test_RoundAmountsSum_WeeklyWithRemainder() public view {
        uint256 goal = 1000e6;
        (uint256 N, uint256 roundAmt, uint256 lastAmt,) =
            piggyBank.previewPlan(goal, PiggyBank.Cadence.Weekly);
        assertEq(roundAmt * (N - 1) + lastAmt, goal, "weekly sum != goal");
    }

    function test_RoundAmountsSum_MonthlyWithRemainder() public view {
        uint256 goal = 777e6;
        (uint256 N, uint256 roundAmt, uint256 lastAmt,) =
            piggyBank.previewPlan(goal, PiggyBank.Cadence.Monthly);
        assertEq(roundAmt * (N - 1) + lastAmt, goal, "monthly sum != goal");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. On-time deduction
    // ─────────────────────────────────────────────────────────────────────────

    function test_Deduct_OnTime_NoFee() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);
        uint256 roundAmt = goal / 30;

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        piggyBank.deduct(planId);

        assertEq(usdc.balanceOf(alice), aliceBefore - roundAmt);
        assertEq(usdc.balanceOf(address(piggyBank)), roundAmt);

        PiggyBank.RoundRecord memory rec = piggyBank.getRoundRecord(planId, 0);
        assertTrue(rec.fulfilled);
        assertEq(rec.amountPaid, roundAmt);
        assertEq(rec.feeCharged, 0);

        PiggyBank.Plan memory p = _plan(planId);
        assertEq(p.currentRoundIndex, 1);
        assertEq(p.amountSaved, roundAmt);
        assertEq(p.feesPaid, 0);
    }

    function test_Deduct_Prepayment_AllowsPayingNextRound() public {
        uint256 planId = _createPlan(alice, 300e6, PiggyBank.Cadence.Daily);

        // Deduct round 0 on time
        vm.prank(alice);
        piggyBank.deduct(planId);
        
        PiggyBank.Plan memory p0 = _plan(planId);
        assertEq(p0.currentRoundIndex, 1);

        // Call deduct again immediately (prepaying round 1)
        vm.prank(alice);
        piggyBank.deduct(planId); 
        
        PiggyBank.Plan memory p1 = _plan(planId);
        assertEq(p1.currentRoundIndex, 2);
    }

    function test_Deduct_OnTime_ByKeeper_NoIncentive() public {
        uint256 planId = _createPlan(alice, 300e6, PiggyBank.Cadence.Daily);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(bob);
        piggyBank.deduct(planId); // on-time: no fee generated, no keeper incentive

        assertEq(usdc.balanceOf(bob), bobBefore, "keeper gets nothing on on-time call");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Catch-up / missed round
    // ─────────────────────────────────────────────────────────────────────────

    function test_CatchUp_OneMissedRound_FeeCharged() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);
        uint256 roundAmt = goal / 30;
        uint256 fee = roundAmt / 100;

        // Warp: round 0 deadline + 1 sec → round 0 missed, round 1 current
        vm.warp(block.timestamp + 1 days + 1);

        uint256 aliceBefore  = usdc.balanceOf(alice);
        uint256 treasBefore  = usdc.balanceOf(treasury);

        vm.prank(alice);
        piggyBank.deduct(planId);

        // Round 0 (missed): roundAmt + fee; Round 1 (current): roundAmt
        uint256 expectedPull = (roundAmt + fee) + roundAmt;
        assertEq(usdc.balanceOf(alice), aliceBefore - expectedPull, "pull mismatch");

        // Alice is the owner — no keeper cut, full fee to treasury
        assertEq(usdc.balanceOf(treasury), treasBefore + fee, "treasury fee mismatch");

        PiggyBank.RoundRecord memory rec0 = piggyBank.getRoundRecord(planId, 0);
        PiggyBank.RoundRecord memory rec1 = piggyBank.getRoundRecord(planId, 1);
        assertTrue(rec0.fulfilled);
        assertEq(rec0.feeCharged, fee);
        assertTrue(rec1.fulfilled);
        assertEq(rec1.feeCharged, 0);

        PiggyBank.Plan memory p = _plan(planId);
        assertEq(p.currentRoundIndex, 2);
        assertEq(p.amountSaved, roundAmt * 2, "amountSaved: principal only");
        assertEq(p.feesPaid, fee, "feesPaid mismatch");
    }

    function test_CatchUp_KeeperGetsIncentive() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);
        uint256 roundAmt = goal / 30;
        uint256 fee = roundAmt / 100;

        vm.warp(block.timestamp + 1 days + 1); // round 0 missed

        uint256 bobBefore  = usdc.balanceOf(bob);
        uint256 treasBefore = usdc.balanceOf(treasury);

        vm.prank(bob); // keeper
        piggyBank.deduct(planId);

        uint256 keeperCut  = (fee * DEFAULT_KEEPER_INCENTIVE) / 10_000;
        uint256 treasCut   = fee - keeperCut;

        assertEq(usdc.balanceOf(bob), bobBefore + keeperCut, "keeper incentive mismatch");
        assertEq(usdc.balanceOf(treasury), treasBefore + treasCut, "treasury cut mismatch");
    }

    function test_CatchUp_PerRoundAttributionCorrect() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);
        uint256 roundAmt = goal / 30;
        uint256 fee = roundAmt / 100;

        // Warp 2 periods + 1 sec → rounds 0 and 1 missed, round 2 current
        vm.warp(block.timestamp + 2 * 1 days + 1);

        vm.prank(alice);
        piggyBank.deduct(planId);

        PiggyBank.RoundRecord memory rec0 = piggyBank.getRoundRecord(planId, 0);
        PiggyBank.RoundRecord memory rec1 = piggyBank.getRoundRecord(planId, 1);
        PiggyBank.RoundRecord memory rec2 = piggyBank.getRoundRecord(planId, 2);

        assertTrue(rec0.fulfilled);
        assertEq(rec0.feeCharged, fee, "round 0 should have fee (missed)");
        assertTrue(rec1.fulfilled);
        assertEq(rec1.feeCharged, fee, "round 1 should have fee (missed)");
        assertTrue(rec2.fulfilled);
        assertEq(rec2.feeCharged, 0, "round 2 is current - no fee");

        PiggyBank.Plan memory p = _plan(planId);
        assertEq(p.currentRoundIndex, 3);
        assertEq(p.amountSaved, roundAmt * 3, "principal only");
        assertEq(p.feesPaid, fee * 2, "2 missed-round fees");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Worst-case approval sufficiency (off-chain computation)
    // ─────────────────────────────────────────────────────────────────────────

    function test_WorstCase_ApprovalAlwaysSufficient() public pure {
        uint256 goal = 300e6;
        uint256 N = 30;
        uint256 roundAmt = goal / N;
        uint256 lastAmt  = goal - (roundAmt * (N - 1));
        uint256 required = goal + goal / 100;

        uint256 totalPull;
        for (uint256 i = 0; i < N; i++) {
            uint256 rAmt = (i == N - 1) ? lastAmt : roundAmt;
            totalPull += rAmt + rAmt / 100; // worst case: every round missed
        }
        assertLe(totalPull, required, "worst-case pull exceeds approval buffer");
        assertEq(totalPull - (goal + goal / 100), 0, "sanity: totalPull should exactly equal approval");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. amountSaved and feesPaid are never conflated
    // ─────────────────────────────────────────────────────────────────────────

    function test_AmountSavedAndFeesPaid_NeverConflated() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);
        uint256 roundAmt = goal / 30;
        uint256 fee = roundAmt / 100;

        // Round 0: on-time, no fee
        vm.prank(alice);
        piggyBank.deduct(planId);

        PiggyBank.Plan memory p0 = _plan(planId);
        assertEq(p0.amountSaved, roundAmt, "on-time: amountSaved");
        assertEq(p0.feesPaid, 0,          "on-time: feesPaid");

        // Warp: round 1 deadline passes, round 2 becomes current
        // Round 1 deadline = plan start + 2*period (since round 0 deadline was start+period
        // and we advanced to round 1 deadline = start + 2*period after round 0 was paid).
        // We warp 2+ periods from NOW (which is still at plan start) to make round 1 missed.
        vm.warp(block.timestamp + 2 * 1 days + 1);

        vm.prank(alice);
        piggyBank.deduct(planId); // catches up: round 1 (missed+fee) + round 2 (current)

        PiggyBank.Plan memory p1 = _plan(planId);
        // Total principal: round0 + round1 + round2 = 3 rounds
        // Total fees: round1 fee only (1 missed)
        assertEq(p1.amountSaved, roundAmt * 3, "amountSaved == 3 rounds principal");
        assertEq(p1.feesPaid,    fee,           "feesPaid == 1 missed-round fee");
        assertTrue(p1.amountSaved != p1.feesPaid, "principal and fees are separate");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Plan completion
    // ─────────────────────────────────────────────────────────────────────────

    function test_PlanCompletion_AllRoundsOnTime() public {
        uint256 goal = 30e6; // 30 USDC / 30 rounds = 1 USDC each
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);
        uint256 aliceStart = usdc.balanceOf(alice);

        for (uint256 i = 0; i < 30; i++) {
            vm.prank(alice);
            piggyBank.deduct(planId);
            vm.warp(block.timestamp + 1 days);
        }

        PiggyBank.Plan memory p = _plan(planId);
        assertFalse(p.active, "plan should be inactive");
        assertTrue(p.completed, "plan should be completed");
        assertEq(p.amountSaved, 0, "savings transferred out");
        // No fees paid (all on-time), so alice gets her full goal back
        assertEq(usdc.balanceOf(alice), aliceStart, "alice gets full goal back");
    }

    function test_ClaimCompletion_RevertsIfAlreadyCompleted() public {
        uint256 planId = _createPlan(alice, 30e6, PiggyBank.Cadence.Daily);
        for (uint256 i = 0; i < 30; i++) {
            vm.prank(alice);
            piggyBank.deduct(planId);
            vm.warp(block.timestamp + 1 days);
        }
        // Auto-completed: active=false, completed=true.
        // claimCompletion calls _activePlan which checks active first -> PlanNotActive
        vm.expectRevert(abi.encodeWithSelector(PlanNotActive.selector, planId));
        vm.prank(bob);
        piggyBank.claimCompletion(planId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Emergency withdrawal
    // ─────────────────────────────────────────────────────────────────────────

    function test_EmergencyWithdraw_FeeCorrect() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            piggyBank.deduct(planId);
            vm.warp(block.timestamp + 1 days);
        }

        PiggyBank.Plan memory p = _plan(planId);
        uint256 feeAmt    = (p.amountSaved * DEFAULT_EMERGENCY_FEE_BPS) / 10_000;
        uint256 returnAmt = p.amountSaved - feeAmt;

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 treasBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        piggyBank.emergencyWithdraw(planId);

        assertEq(usdc.balanceOf(alice), aliceBefore + returnAmt, "return amount wrong");
        assertEq(usdc.balanceOf(treasury), treasBefore + feeAmt,  "treasury fee wrong");

        PiggyBank.Plan memory p2 = _plan(planId);
        assertFalse(p2.active, "plan inactive after emergency withdrawal");
        assertFalse(p2.completed, "completed=false distinguishes early exit from goal completion");
    }

    function test_EmergencyWithdraw_UsesLockedFeeBps_NotGlobal() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);

        // Admin raises global default AFTER plan creation
        vm.prank(admin);
        piggyBank.setDefaultEmergencyFeeBps(1000); // 10%

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            piggyBank.deduct(planId);
            vm.warp(block.timestamp + 1 days);
        }

        PiggyBank.Plan memory p = _plan(planId);
        // Fee must use 500 bps (locked at creation), NOT the new 1000 bps global
        uint256 expectedFee  = (p.amountSaved * DEFAULT_EMERGENCY_FEE_BPS) / 10_000;
        uint256 expectedRet  = p.amountSaved - expectedFee;
        uint256 aliceBefore  = usdc.balanceOf(alice);

        vm.prank(alice);
        piggyBank.emergencyWithdraw(planId);

        assertEq(usdc.balanceOf(alice), aliceBefore + expectedRet,
            "must use locked bps, not updated global");
    }

    function test_EmergencyWithdraw_RevertsIfNotOwner() public {
        uint256 planId = _createPlan(alice, 300e6, PiggyBank.Cadence.Daily);
        vm.expectRevert(abi.encodeWithSelector(NotPlanOwner.selector, planId, bob));
        vm.prank(bob);
        piggyBank.emergencyWithdraw(planId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Permissionless deduct by non-owner
    // ─────────────────────────────────────────────────────────────────────────

    function test_Deduct_PermissionlessByNonOwner_Missed() public {
        uint256 goal = 300e6;
        uint256 planId = _createPlan(alice, goal, PiggyBank.Cadence.Daily);
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.warp(block.timestamp + 2 * 1 days + 1); // round 0 missed

        vm.prank(bob);
        piggyBank.deduct(planId); // keeper call — should succeed

        assertLt(usdc.balanceOf(alice), aliceBefore, "alice funds pulled by keeper");
        assertGt(usdc.balanceOf(bob), 1_000e6, "bob received keeper incentive");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Admin functions
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetAcceptedToken_AdminOnly() public {
        address newToken = address(0xBEEF);
        vm.expectRevert();
        vm.prank(alice);
        piggyBank.setAcceptedToken(newToken, true);

        vm.prank(admin);
        piggyBank.setAcceptedToken(newToken, true);
        assertTrue(piggyBank.acceptedTokens(newToken));
    }

    function test_SetDefaultEmergencyFee_BoundsEnforced() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(FeeBpsOutOfBounds.selector, 50, 100, 1000));
        piggyBank.setDefaultEmergencyFeeBps(50);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(FeeBpsOutOfBounds.selector, 2000, 100, 1000));
        piggyBank.setDefaultEmergencyFeeBps(2000);

        vm.prank(admin);
        piggyBank.setDefaultEmergencyFeeBps(800);
        assertEq(piggyBank.defaultEmergencyFeeBps(), 800);
    }

    function test_SetTreasuryAddress_ZeroAddressReverts() public {
        vm.prank(admin);
        vm.expectRevert(ZeroAddress.selector);
        piggyBank.setTreasuryAddress(address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. View helpers
    // ─────────────────────────────────────────────────────────────────────────

    function test_ComputeRequiredApproval() public view {
        uint256 goal = 1000e6;
        assertEq(piggyBank.computeRequiredApproval(goal), goal + goal / 100);
    }

    function test_PreviewPlan_SumsToGoal() public view {
        uint256 goal = 777e6;
        (, uint256 roundAmt, uint256 lastAmt, uint256 approval) =
            piggyBank.previewPlan(goal, PiggyBank.Cadence.Monthly);
        assertEq(roundAmt * 11 + lastAmt, goal, "preview: sum != goal");
        assertEq(approval, goal + goal / 100);
    }
}
