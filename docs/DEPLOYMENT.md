# Deployment

## Current deployment (2026-11-14)

All contracts are live. Addresses and tx hashes are in `deployments/`:

- `deployments/base-sepolia.json` — MockERC20, MockPriceFeed, PulseGuardVault, ProtectionManager, ProtectionExecutor
- `deployments/unichain-sepolia.json` — CrossChainExecutor
- `deployments/reactive-lasna.json` — PulseGuardReactive

Deployer: `0x6Cac76f9e8d6F55b3823D8aEADEad970a5441b67`

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

# 5. Base Sepolia: wire everything
MANAGER_ADDRESS=0x<manager> VAULT_ADDRESS=0x<vault> \
BASE_EXECUTOR=0x<baseExecutor> UNI_EXECUTOR=0x<uniExecutor> \
REACTIVE_ADDRESS=0x<reactive> \
DEPLOYER_PRIVATE_KEY=0x... \
forge script script/Configure.s.sol:Configure \
  --rpc-url $BASE_RPC --broadcast
```

## Post-deploy

1. Record addresses in `deployments/*.json`.
2. Set `NEXT_PUBLIC_*` env vars in `apps/web/.env.local`.
3. Fund reactive contract (REACT on Lasna) and executors (native token).
4. Mirror policies on reactive contract via `mirrorPolicy` (owner-only) as policies are created.
5. Run the demo flow in `docs/DEMO_SCRIPT.md`.

## Verification

```bash
forge verify-contract <addr> <Contract> --chain <id> --etherscan-api-key <key>
```
