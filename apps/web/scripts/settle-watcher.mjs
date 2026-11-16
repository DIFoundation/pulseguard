// PulseGuard settlement watcher — auto-settles attested policies on Base.
//
// Polls ProtectionManager for ACTIVE policies whose destination chain is
// attestation-only (Unichain, 1301). When the live feed price satisfies the
// trigger, it calls SettlementRelay.settle(policyId) — the manager re-validates
// everything on-chain, so this relayer is just a gas-paying keeper. Anyone can
// also settle manually via the UI; this only removes the manual step.
//
// Run:  pnpm --filter web settle:watch   (from repo root)
// Env:  DEPLOYER_PRIVATE_KEY, NEXT_PUBLIC_MANAGER_ADDRESS,
//       NEXT_PUBLIC_SETTLEMENT_RELAY, NEXT_PUBLIC_FEED_ADDRESS

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.BASE_SEPOLIA_RPC_URL ?? "https://base-sepolia-rpc.publicnode.com";
const PK = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.SETTLER_PRIVATE_KEY;
const MANAGER = process.env.NEXT_PUBLIC_MANAGER_ADDRESS ?? "0x98BDCD32229f39C821313Ab5eEA458E862A2EFCe";
const RELAY = process.env.NEXT_PUBLIC_SETTLEMENT_RELAY ?? "0x174000Ff3f26F7f40d683992802E1Db6394197B6";
const FEED = process.env.NEXT_PUBLIC_FEED_ADDRESS ?? "0xD931C24199a65A7A80fc0758272bBb5e4958F4B0";

const ATTESTATION_ONLY_CHAINS = new Set([1301n]); // Unichain Sepolia
const POLL_MS = 8000;
const MAX_POLICIES = 50;

const managerAbi = parseAbi([
  "function nextPolicyId() view returns (uint256)",
  "function getPolicy(uint256) view returns ((uint256 id, address owner, address asset, address monitoredAsset, uint256 destinationChainId, uint8 triggerType, uint256 threshold, uint256 referencePrice, uint256 maxDrawdownBps, uint256 protectedAmount, address recipient, uint8 action, uint8 status, uint64 createdAt, uint64 expiresAt, uint64 executedAt, bytes32 hash))",
  "function isTriggered(uint256, uint256) view returns (bool)",
]);
const feedAbi = parseAbi(["function latestPrice(address) view returns (uint256 price, uint256 timestamp)"]);
const relayAbi = parseAbi(["function settle(uint256 policyId)"]);

if (!PK) {
  console.error("Missing DEPLOYER_PRIVATE_KEY (or SETTLER_PRIVATE_KEY) in env");
  process.exit(1);
}

const account = privateKeyToAccount(PK.startsWith("0x") ? PK : `0x${PK}`);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

console.log(`settle-watcher: relayer ${account.address}`);
console.log(`  manager ${MANAGER} · relay ${RELAY} · feed ${FEED} · poll ${POLL_MS}ms`);

const STATUS_ACTIVE = 1;

async function scan() {
  const nextId = await publicClient.readContract({
    address: MANAGER, abi: managerAbi, functionName: "nextPolicyId",
  });
  const count = Number(nextId) - 1;
  if (count <= 0) return;

  const ids = [];
  for (let i = Math.max(1, count - MAX_POLICIES + 1); i <= count; i++) ids.push(BigInt(i));

  // Batch-read policies via multicall.
  const policies = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: MANAGER, abi: managerAbi, functionName: "getPolicy", args: [id],
    })),
    allowFailure: true,
  });

  for (let i = 0; i < ids.length; i++) {
    const res = policies[i];
    if (res.status !== "success") continue;
    const p = res.result;
    if (p.status !== STATUS_ACTIVE) continue;
    if (!ATTESTATION_ONLY_CHAINS.has(p.destinationChainId)) continue;

    const [price] = await publicClient.readContract({
      address: FEED, abi: feedAbi, functionName: "latestPrice", args: [p.monitoredAsset],
    });
    const triggered = await publicClient.readContract({
      address: MANAGER, abi: managerAbi, functionName: "isTriggered", args: [ids[i], price],
    });
    if (!triggered) continue;

    console.log(`policy #${ids[i]} triggered (price ${price}) — settling…`);
    try {
      const hash = await walletClient.writeContract({
        address: RELAY, abi: relayAbi, functionName: "settle", args: [ids[i]],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  settled #${ids[i]} — tx ${hash} (block ${receipt.blockNumber})`);
    } catch (e) {
      console.warn(`  settle #${ids[i]} failed: ${String(e).slice(0, 160)}`);
    }
  }
}

console.log("watching… (Ctrl+C to stop)");
for (;;) {
  try {
    await scan();
  } catch (e) {
    console.warn("scan error:", String(e).slice(0, 200));
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
