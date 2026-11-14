# Demo Script (Judges)

## Scenario

User has a protected position. Reference price $2,000, stop-loss 5% → trigger $1,900.

## Flow

1. **Connect wallet** (Reown AppKit) on Base Sepolia.
2. **Deposit** test assets into PulseGuard Vault (`/vault`).
3. **Create policy** (`/policies/create`): Stop-Loss, threshold $1,900, amount, destination Base Sepolia.
4. **Auto-mirror**: `ProtectionManager` emits `PolicyMirrorSync` → Reactive Network delivers it to `PulseGuardReactive` on Lasna, which registers the policy mirror automatically (no manual tx).
5. **Publish price $1,950** via `MockPriceFeed.updatePrice` → show policy stays ACTIVE, no callback.
6. **Publish price $1,890** → show:
   - Origin `PriceUpdated` event (BaseScan)
   - Reactive `react()` tx + `CallbackRequested` (ReactScan)
   - Destination `executeProtection` tx (BaseScan)
   - `PolicyExecuted` event + vault `ProtectedExit`
7. **Show latency**: origin block timestamp → destination block timestamp (Activity page / manual calc).
8. **Cross-chain**: show Unichain `CrossChainExecutor` record for the same policy.

## Local rehearsal

Use `/simulator` for off-chain scenario rehearsal (clearly labeled as simulation, never mixed with real tx history).

## Evidence to capture

- Origin tx hash (price update)
- Reactive tx hash (react + callback request)
- Destination tx hash (executor)
- Policy final state (`getPolicy` → EXECUTED)
- Block timestamps for latency
