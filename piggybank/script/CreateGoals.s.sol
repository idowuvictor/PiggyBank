// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PiggyBank.sol";
import "../src/MockERC20.sol";

contract CreateGoals is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // TODO: Update these addresses once deployment finishes
        address piggyBankAddr = 0xe3665FbFf485aF993Fa03fae2CCD583b6F770C6d;
        address mockUSDCAddr = 0xe998234aa8a6743d00b738B6cbbE7DB63C60eFb2;

        PiggyBank piggyBank = PiggyBank(piggyBankAddr);
        MockERC20 mockUSDC = MockERC20(mockUSDCAddr);

        vm.startBroadcast(deployerKey);

        // 1. Approve USDC for both goals
        uint256 goal1 = 500 * 10**6; // $500 for devconnect
        uint256 goal2 = 1000 * 10**6; // $1000 for laptop
        
        uint256 requiredApproval1 = piggyBank.computeRequiredApproval(goal1);
        uint256 requiredApproval2 = piggyBank.computeRequiredApproval(goal2);
        
        mockUSDC.approve(address(piggyBank), requiredApproval1 + requiredApproval2);

        // 2. Create "devconnect tour" (Weekly)
        // cadence: 0 = Daily, 1 = Weekly, 2 = Monthly
        piggyBank.createPlan(address(mockUSDC), goal1, PiggyBank.Cadence.Weekly, "devconnect tour");

        // 3. Create "Laptop savings" (Daily)
        piggyBank.createPlan(address(mockUSDC), goal2, PiggyBank.Cadence.Daily, "Laptop savings");

        vm.stopBroadcast();
    }
}
