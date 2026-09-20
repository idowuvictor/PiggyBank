// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PiggyBank.sol";
import "../src/MockERC20.sol";

contract Deploy is Script {
    uint256 constant DEFAULT_EMERGENCY_FEE_BPS = 500;  // 5%
    uint256 constant DEFAULT_KEEPER_INCENTIVE_BPS = 1000; // 10% of collected fee

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        
        // We'll use the deployer as the treasury for simplicity on testnet
        address treasury = deployer; 

        vm.startBroadcast(deployerKey);

        // 1. Deploy Mock ERC20
        MockERC20 mockUSDC = new MockERC20("Mock USDC", "mUSDC", deployer);
        console.log("MockUSDC deployed at:", address(mockUSDC));

        // 2. Deploy PiggyBank
        PiggyBank piggyBank = new PiggyBank(
            treasury,
            DEFAULT_EMERGENCY_FEE_BPS,
            DEFAULT_KEEPER_INCENTIVE_BPS
        );
        console.log("PiggyBank deployed at:", address(piggyBank));

        // 3. Whitelist the Mock Token
        piggyBank.setAcceptedToken(address(mockUSDC), true);
        console.log("Whitelisted MockUSDC for plans");

        // 4. Create a Savings Plan (Interaction)
        // Goal: 1000 USDC over a Daily cadence (30 days)
        uint256 goal = 1000 * 10 ** mockUSDC.decimals();
        uint256 requiredApproval = piggyBank.computeRequiredApproval(goal);
        
        // Approve the PiggyBank contract
        mockUSDC.approve(address(piggyBank), requiredApproval);
        console.log("Approved PiggyBank to spend MockUSDC");

        // Create the plan
        uint256 planId = piggyBank.createPlan(address(mockUSDC), goal, PiggyBank.Cadence.Daily);
        console.log("Created Daily PiggyBank Savings Plan! Plan ID:", planId);

        vm.stopBroadcast();
    }
}
