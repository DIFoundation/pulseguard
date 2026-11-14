# PulseGuard — Implementation Plan

Hackathon: Reactive Omni Buildathon — "Every Second Counts" track.

## Verified Reactive Network facts (from dev.reactive.network, Nov 2026)

- Library: `Reactive-Network/reactive-lib-omni` (Foundry git dep), imports via `@reactive/src/...`.
- Solidity `^0.8.29`.
- `SYSTEM` = `0x8888888888888888888888888888888888888888` on Reactive Lasna (chain 5318007, RPC `https://lasna-rpc.rnk.dev/`).
- Reactive base: `AbstractReactive` → `SYSTEM`, `REACTIVE_IGNORE`, `onlySystem`, abstract `react(LogRecord)`.
- Callback base: `AbstractCallback(callbackProxy_, callbackSender_)` → `onlyServiceProvider`, `onlyCallbackSender(addr)`; both required on callback methods.
- Callback request: `SYSTEM.requestCallbackV_1_0(CallbackConfiguration_V_1_0{chainId, recipient, gasLimit, payload})`. Payload's first arg must be `address(0)` placeholder (proxy overwrites with reactive contract address).
- `LogRecord{chainId, contractAddress, topic0..3, data, blockNumber, opCode, blockHash, txHash, logIndex}`; `opCode` = number of topics; `data` = ABI-encoded non-indexed params.
- Callback proxies (testnet): Base Sepolia `0x476F44b11F5C942c58f4c8E3d0300E5710743585`, Unichain Sepolia `0x775c9B990ADe401060B78D0e98684eEf8d2466C1`.
- Deploy order: reactive contract → callback contract(s) → owner sets recipient(s) on reactive → fund reactive (REACT on Lasna) and callback contracts (native token on destination).
- Callbacks billed to recipient on destination chain; failed callbacks still cost; recipient in debt receives nothing.

## Architecture

```
Base Sepolia (84532)                Reactive Lasna (5318007)          Destinations
┌─────────────────────┐   events   ┌──────────────────────┐  cb     ┌──────────────────────┐
│ MockPriceFeed       │ ─────────► │ PulseGuardReactive   │ ──────► │ BaseSepoliaExecutor  │
│ PulseGuardVault     │  PriceUpd  │  - subscribes        │         │  (AbstractCallback)  │
│ ProtectionManager   │            │  - evaluates policy  │         │  - executes action   │
└─────────────────────┘            │  - requests callback │         └──────────────────────┘
                                   └──────────────────────┘  cb     ┌──────────────────────┐
                                                            ──────► │ UnichainExecutor     │
                                                                      │  (cross-chain state) │
                                                                      └──────────────────────┘
```

Primary path: Base Sepolia price event → Lasna reactive eval → authenticated callback → Base Sepolia executor → vault action (same-chain asset protection).
Secondary path: same event → callback → Unichain Sepolia executor → records cross-chain protection state (demonstrates genuine cross-chain execution; does NOT move Base assets).

## Phases

1. **Scaffold** — pnpm monorepo, Foundry project, deps (forge-std, openzeppelin, reactive-lib-omni).
2. **Core contracts** — Vault, ProtectionManager (policy state machine), Registry, MockPriceFeed, executors. Unit tests per module.
3. **Reactive contract** — `PulseGuardReactive.sol` with subscriptions, LogRecord decoding, threshold eval, `requestCallbackV_1_0`, dedup. Integration tests with mocked SYSTEM.
4. **Deploy scripts** — ordered deployment per Reactive docs; manifests under `deployments/`.
5. **Frontend** — Next.js 16 App Router, wagmi + Reown AppKit, all pages, real ABI reads, simulator, marketplace, activity.
6. **Docs & QA** — README, architecture, security, demo script; forge test + typecheck + lint + build.

## Known constraints

- Contracts are deployed on all three chains (2026-11-14) — see `deployments/*.json`. Redeployment requires `DEPLOYER_PRIVATE_KEY` + testnet funds; see `docs/DEPLOYMENT.md`.
- Reactive Lasna is not a user-facing wallet network; frontend targets Base Sepolia + Unichain Sepolia.
- Mock oracle mode is clearly labeled; no fabricated live prices.
