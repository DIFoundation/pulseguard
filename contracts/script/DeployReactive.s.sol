// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PulseGuardReactive} from "../src/reactive/PulseGuardReactive.sol";

/// @notice Deploys PulseGuardReactive on Reactive Lasna.
/// @dev Run on Lasna (chain 5318007). Constructor subscribes to the origin-chain
///      PriceUpdated event via the system contract.
contract DeployReactive is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Configure via env: ORIGIN_CHAIN_ID, PRICE_FEED_ADDRESS, MANAGER_ADDRESS
        uint256 originChainId = vm.envUint("ORIGIN_CHAIN_ID"); // e.g. 84532
        address priceFeed = vm.envAddress("PRICE_FEED_ADDRESS");
        address manager = vm.envAddress("MANAGER_ADDRESS");
        uint256 priceTopic0 = uint256(keccak256("PriceUpdated(address,uint256,uint256)"));
        uint256 syncTopic0 = uint256(
            keccak256("PolicyMirrorSync(uint256,address,uint8,uint256,uint256,uint256,uint256,uint64,bool)")
        );

        // Fund at deploy: SYSTEM.subscribe in the constructor does not stick when the
        // contract holds no REACT. Override via REACTIVE_FUNDING (wei), default 0.3 REACT.
        uint256 funding = vm.envOr("REACTIVE_FUNDING", uint256(0.3 ether));

        vm.startBroadcast(deployerKey);
        PulseGuardReactive reactive = new PulseGuardReactive{value: funding}(
            originChainId, priceFeed, priceTopic0, manager, syncTopic0
        );
        console2.log("reactive", address(reactive));
        console2.log("chainId", block.chainid);
        vm.stopBroadcast();
    }
}
