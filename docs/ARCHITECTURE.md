# Architecture

## Components

| Contract | Chain | Role |
|---|---|---|
| `MockERC20` | Base Sepolia | Test asset (18 decimals) |
| `MockPriceFeed` | Base Sepolia | Operator-gated price publisher; emits `PriceUpdated(address indexed asset, uint256 price, uint256 timestamp)` |
| `PulseGuardVault` | Base Sepolia | Non-custodial ERC-20 vault; `protectedExit` only callable by registered executor |
| `ProtectionManager` | Base Sepolia | Policy state machine + trigger evaluation + execution |
| `ProtectionExecutor` | Base Sepolia | `AbstractCallback` destination executor; calls `manager.executePolicy` |
| `CrossChainExecutor` | Unichain Sepolia | `AbstractCallback` cross-chain record keeper |
| `PulseGuardReactive` | Reactive Lasna | `AbstractReactive`; subscribes to `PriceUpdated` + `PolicyMirrorSync`, mirrors policies, requests callbacks |

## Policy state machine

```
CREATED → ACTIVE → TRIGGERED → EXECUTED
   ↓         ↓         ↓
CANCELLED  EXPIRED   FAILED
```

- `createPolicy` sets status ACTIVE directly (simplified for hackathon).
- `deactivatePolicy` ACTIVE→CREATED; `activatePolicy` CREATED→ACTIVE.
- `cancelPolicy` → CANCELLED (terminal except EXECUTED/CANCELLED).
- `executePolicy` (executor-only) re-validates trigger against live feed price, then ACTIVE→EXECUTED atomically. Repeat execution reverts.

## Trigger types

| Type | Condition |
|---|---|
| STOP_LOSS (0) | `price <= threshold` |
| TAKE_PROFIT (1) | `price >= threshold` |
| MAX_DRAWDOWN (2) | `price <= referencePrice * (10000 - maxDrawdownBps) / 10000` |
| EMERGENCY (3) | `price <= threshold` |

## Data flow

1. Operator calls `MockPriceFeed.updatePrice(asset, price)` on Base Sepolia → emits `PriceUpdated`.
2. Reactive Network delivers the log to `PulseGuardReactive.react(LogRecord)` on Lasna (`onlySystem`).
3. `react()` validates `chainId`, `contractAddress`, `topic0`, `opCode`; decodes `asset` (topic1) and `(price, timestamp)` (data) for price events, or upserts/deactivates the policy mirror for `PolicyMirrorSync` events (`opCode==3`).
4. For each mirrored ACTIVE policy on that asset where `_isTriggered` holds, it dedups by `keccak256(txHash, logIndex, policyId)` and calls `SYSTEM.requestCallbackV_1_0` with:
   - Base Sepolia → `ProtectionExecutor.executeProtection(address(0), policyId)`
   - Other chains → `CrossChainExecutor.recordProtection(address(0), policyId, price)`
5. The callback proxy injects the reactive contract address into the payload's first arg; the executor's `onlyServiceProvider onlyCallbackSender` modifiers authenticate it.
6. `ProtectionExecutor` → `ProtectionManager.executePolicy` → re-reads feed price, re-checks trigger, transitions to EXECUTED, calls `vault.protectedExit(owner, recipient, amount)`.

## Why Reactive is essential

No backend, cron, or keeper decides triggers. The reactive contract on Lasna is the only component that observes origin events and initiates callbacks. The destination executor independently re-validates everything on-chain, so the reactive contract is never trusted.

## Policy mirroring

`PulseGuardReactive` cannot make synchronous cross-chain view calls to `ProtectionManager` on Base Sepolia. It therefore keeps a **mirror** of policy parameters for trigger evaluation. Mirrors are synced automatically: `ProtectionManager` emits `PolicyMirrorSync` on every lifecycle transition (create/activate → `active=true`; deactivate/cancel/execute → `active=false`), and the reactive contract subscribes to that event on the origin chain. The executor remains authoritative — it re-validates every policy on-chain before executing, so mirror drift can never move funds incorrectly.
