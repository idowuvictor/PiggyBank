// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PiggyBank.sol";
import "../src/MockERC20.sol";

contract CreateWeeklyPlan is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        
        // Addresses from our recent deployment on Electroneum Testnet
        address piggyBankAddr = 0x8d09d183A2d0D5a9cC91172a8568e0A1C27314ce;
        address mockUSDCAddr = 0xF2837cD516f35686cBfD91B8A523abE6216DdE52;

        PiggyBank piggyBank = PiggyBank(piggyBankAddr);
        MockERC20 mockUSDC = MockERC20(mockUSDCAddr);

        vm.startBroadcast(deployerKey);

        // Goal: 500 USDC over a Weekly cadence (12 weeks)
        uint256 goal = 500 * 10 ** mockUSDC.decimals();
        uint256 requiredApproval = piggyBank.computeRequiredApproval(goal);
        
        // Approve the PiggyBank contract
        mockUSDC.approve(address(piggyBank), requiredApproval);
        console.log("Approved PiggyBank to spend MockUSDC");

        // Create the plan
        uint256 planId = piggyBank.createPlan(address(mockUSDC), goal, PiggyBank.Cadence.Weekly);
        console.log("Created Weekly PiggyBank Savings Plan! Plan ID:", planId);

        vm.stopBroadcast();
    }
}
