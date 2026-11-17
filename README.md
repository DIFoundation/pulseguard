# PulseGuard

**Autonomous Cross-Chain DeFi Protection Protocol** — Reactive Omni Buildathon, "Every Second Counts" track.

> Protect your positions. React in milliseconds. Stay in control.

PulseGuard lets DeFi users configure programmable protection policies (stop-loss, take-profit, max drawdown, emergency) that are executed automatically by **Reactive Network** — no bots, no polling, no trusted backend.

> **Execution semantics**: a triggered policy performs a *protected vault exit* — an on-chain transfer of your deposited funds to your pre-configured recipient. No swap or market sell is executed.

## Problem

DeFi users face sudden price declines, drawdowns, and delayed emergency responses. Existing solutions rely on centralized keepers or manual monitoring. PulseGuard makes protection **event-driven and autonomous**: Reactive Network subscribes to on-chain events, evaluates conditions, and delivers authenticated callbacks to destination-chain executors.

## Architecture

```
Base Sepolia (origin)          Reactive Lasna              Destinations
+-----------------+   events   +------------------+  cb    +---------------------+
| MockPriceFeed   | ---------> | PulseGuardReactive| -----> | Base Sepolia Executor|
| ProtectionVault |  PriceUpd |  - subscribe     |        |  - execute action    |
| ProtectionMgr   |           |  - evaluate      |        +---------------------+
+-----------------+           |  - request cb    |  cb    +---------------------+
                              +------------------+ -----> | Unichain Executor    |
                                                          |  - attestation record  |
                                                          +---------------------+
```

- **Origin**: Base Sepolia — vault, policy manager, mock price feed.
- **Reactive**: Lasna — `PulseGuardReactive` subscribes to `PriceUpdated`, evaluates mirrored policies, requests callbacks via `SYSTEM.requestCallbackV_1_0`.
- **Destinations**: Base Sepolia executor (executes real vault action) + Unichain Sepolia executor (verifiable cross-chain attestation of the protection event).

See `docs/ARCHITECTURE.md` and `docs/REACTIVE_INTEGRATION.md`.

## Repo structure

```
pulseguard/
├── apps/web/          # Next.js 16 frontend (App Router, wagmi, Reown AppKit)
├── contracts/         # Foundry project (Solidity 0.8.29)
├── packages/abi/      # Contract ABIs generated from Forge artifacts
├── packages/config/   # Chains, contract addresses, environment
├── deployments/       # Deployment manifests (populate after deploy)
└── docs/              # Architecture, security, deployment, demo docs
```

## Quick start

```bash
# Contracts
cd contracts
forge install   # if needed
forge test      # 49 tests

# Frontend
pnpm install
cp .env.example apps/web/.env.local   # fill in values
pnpm --filter web dev
```

## Status

- ✅ Smart contracts implemented + 49 Foundry tests passing
- ✅ Reactive Omni integration (`AbstractReactive`/`AbstractCallback`, `requestCallbackV_1_0`)
- ✅ Deployed on Base Sepolia, Unichain Sepolia, and Reactive Lasna (latest 2026-11-17) — see `deployments/*.json`
- ✅ Next.js frontend: landing, dashboard, vault, policies, marketplace, simulator, activity (multi-chain, paginated, latency badges), settings
- ✅ Production build passes (`pnpm --filter web build`)
- ✅ Full demo flow rehearsed end-to-end (Base + Unichain destinations, ~2s latency) — evidence in `docs/DEMO_SCRIPT.md`

## Disclaimer

Testnet hackathon prototype. Not audited. Do not use with real funds. Mock oracle prices are operator-published.
