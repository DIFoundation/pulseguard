import type { Abi } from "viem";
import vaultAbi from "./PulseGuardVault.json";
import managerAbi from "./ProtectionManager.json";
import executorAbi from "./ProtectionExecutor.json";
import crossChainExecutorAbi from "./CrossChainExecutor.json";
import feedAbi from "./MockPriceFeed.json";
import reactiveAbi from "./PulseGuardReactive.json";
import settlementRelayArtifact from "./SettlementRelay.json";
import mockErc20Abi from "./MockErc20.json";

export const PulseGuardVaultAbi = vaultAbi as unknown as Abi;
export const ProtectionManagerAbi = managerAbi as unknown as Abi;
export const ProtectionExecutorAbi = executorAbi as unknown as Abi;
export const CrossChainExecutorAbi = crossChainExecutorAbi as unknown as Abi;
export const MockPriceFeedAbi = feedAbi as unknown as Abi;
export const SettlementRelayAbi = settlementRelayArtifact as unknown as Abi;
export const PulseGuardReactiveAbi = reactiveAbi as unknown as Abi;
export const MockErc20Abi = mockErc20Abi as unknown as Abi;
