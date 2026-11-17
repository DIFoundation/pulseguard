# Deployment

## Current deployment (2026-11-17, post-remediation)

All contracts redeployed with the remediation fixes and **verified on explorers**
(Base Sepolia + Unichain Sepolia). Addresses and tx hashes are in `deployments/`:

- `deployments/base-sepolia.json` — MockERC20 `0x9e8c…e77d`, MockPriceFeed `0x3c46…fb88`, PulseGuardVault `0x8186…35e3`, ProtectionManager `0x1a5c…1f4e`, ProtectionExecutor `0x35Ad…bDC8`, SettlementRelay `0x3703…7519`
- `deployments/unichain-sepolia.json` — CrossChainExecutor `0xD931…F4B0`
- `deployments/reactive-lasna.json` — PulseGuardReactive `0xdE25…0C7b` (funded 0.3 REACT at deploy — constructor subscriptions require balance)

Deployer: `0x6Cac76f9e8d6F55b3823D8aEADEad970a5441b67`

Configuration txs: `Configure.s.sol` on Base (manager executors + reactive + vault executor),
`ConfigureReactive.s.sol` on Lasna (`executorForChain[84532]`/`[1301]`).

The steps below are for redeployment or fresh environments.

## Prerequisites

- Foundry (`forge`, `cast`)
- pnpm
- `DEPLOYER_PRIVATE_KEY` with testnet funds on:
  - Base Sepolia (ETH) — vault, manager, feed, executor
  - Unichain Sepolia (ETH) — cross-chain executor
  - Reactive Lasna (REACT) — reactive contract funding
- RPC endpoints (see `.env.example`)

## Order (mandatory — Reactive callback auth requires it)

```bash
cd contracts

# 1. Base Sepolia: origin contracts
BASE_RPC=https://sepolia.base.org \
DEPLOYER_PRIVATE_KEY=0x... \
forge script script/Deploy.s.sol:DeployOrigin \
  --rpc-url $BASE_RPC --broadcast --verify

# 2. Reactive Lasna: reactive contract (subscribes in constructor)
LASNA_RPC=https://lasna-rpc.rnk.dev/ \
DEPLOYER_PRIVATE_KEY=0x... \
ORIGIN_CHAIN_ID=84532 \
PRICE_FEED_ADDRESS=0x<feed> \
MANAGER_ADDRESS=0x<manager> \
forge script script/DeployReactive.s.sol:DeployReactive \
  --rpc-url $LASNA_RPC --broadcast

# 3. Base Sepolia: protection executor (needs reactive address)
MANAGER_ADDRESS=0x<manager> REACTIVE_ADDRESS=0x<reactive> \
CALLBACK_PROXY=0x476F44b11F5C942c58f4c8E3d0300E5710743585 \
DEPLOYER_PRIVATE_KEY=0x... \
forge script script/DeployExecutor.s.sol:DeployExecutor \
  --rpc-url $BASE_RPC --broadcast

# 4. Unichain Sepolia: cross-chain executor
UNICHAIN_RPC=https://sepolia.unichain.org \
REACTIVE_ADDRESS=0x<reactive> \
CALLBACK_PROXY=0x775c9B990ADe401060B78D0e98684eEf8d2466C1 \
CROSS_CHAIN=true \
DEPLOYER_PRIVATE_KEY=0x... \
forge script script/DeployExecutor.s.sol:DeployExecutor \
  --rpc-url $UNICHAIN_RPC --broadcast

# 5. Base Sepolia: wire manager + vault
MANAGER_ADDRESS=0x<manager> VAULT_ADDRESS=0x<vault> \
BASE_EXECUTOR=0x<baseExecutor> UNI_EXECUTOR=0x<uniExecutor> \
REACTIVE_ADDRESS=0x<reactive> \
DEPLOYER_PRIVATE_KEY=0x... \
forge script script/Configure.s.sol:Configure \
  --rpc-url $BASE_RPC --broadcast

# 6. Reactive Lasna: register destination executors on the reactive contract.
#    PulseGuardReactive keeps its OWN executorForChain mapping (separate from
#    ProtectionManager's) — without this step react() skips callback requests.
REACTIVE_ADDRESS=0x<reactive> \
DEPLOYER_PRIVATE_KEY=0x... \
forge script script/ConfigureReactive.s.sol:ConfigureReactive \
  --rpc-url $LASNA_RPC --broadcast
```

## Post-deploy

1. Record addresses in `deployments/*.json` **and the configuration tx hashes**
   (Configure on Base, ConfigureReactive on Lasna) so the wiring is auditable.
2. Set `NEXT_PUBLIC_*` env vars in `apps/web/.env.local`.
3. Fund reactive contract (REACT on Lasna) and executors (native token).
4. Verify executor mappings on both contracts:
   - `cast call $MANAGER "executorForChain(uint256)(address)" 84532 --rpc-url $BASE_RPC`
   - `cast call $REACTIVE "executorForChain(uint256)(address)" 84532 --rpc-url $LASNA_RPC`
   - `cast call $REACTIVE "executorForChain(uint256)(address)" 1301 --rpc-url $LASNA_RPC`
5. Policies auto-mirror on Lasna via `PolicyMirrorSync` events — no manual `mirrorPolicy` calls needed (owner override still available).
6. Run the demo flow in `docs/DEMO_SCRIPT.md`.

## Verification

```bash
forge verify-contract <addr> <Contract> --chain <id> --etherscan-api-key <key>
```
