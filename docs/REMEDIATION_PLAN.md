# PulseGuard Remediation Plan

Source: external technical review (16 Nov 2026). Ordered by dependency — contract fixes first, then mirror lifecycle, then observability, then docs/tests/demo.

## Phase 1 — Vault reservation accounting (P0)

**Problem:** Active policies do not reserve protected funds. A user can deposit 100, create a policy protecting 80, withdraw all 100, and the protection fails at execution. Multiple policies can also commit to the same balance.

**Changes:**
- `ProtectionVault`: add `mapping(address => uint256) public reservedBalances`.
- On policy creation (via manager → vault hook or manager-side accounting): reserve `protectedAmount`.
- On cancel / expire / execute: release the reservation.
- `withdraw()`: enforce `amount <= balance - reservedBalance`.
- `ProtectionManager.createPolicy()`: reject if `sum(protectedAmount) > available balance`.

**Tests:** withdraw blocked by active reservation; overlapping policies rejected; reservation released on cancel/expire/execute.

## Phase 2 — Expiry / execution event semantics (P0)

**Problem:** `ProtectionManager.executePolicy()` returns normally after marking a policy `EXPIRED`, so `ProtectionExecutor` still emits `ProtectionExecuted` with no funds moved. Judges inspecting events see false executions.

**Changes:**
- `ProtectionExecutor.executeProtection()`: only emit `ProtectionExecuted` when an actual protection action occurred. Emit a distinct event (e.g. `ProtectionExpiredCallback` / `PolicyNotExecuted`) for expired/no-op paths.
- Have `executePolicy()` return a status enum (or expose last-action) so the executor can distinguish `EXECUTED` vs `EXPIRED` vs `UNSUPPORTED`.
- Ensure expired callbacks are clearly labelled in events and UI.

**Tests:** expired policy callback does not emit `ProtectionExecuted`; emits expiry-specific event instead.

## Phase 3 — Reactive mirror lifecycle (P1)

**Problem:** `expiresAt` is not in the mirror sync event / `MirrorPolicy`, so Reactive can trigger on expired policies.

**Changes:**
- Add `expiresAt` to `PolicyMirrorSync` event and `MirrorPolicy` struct/params in `ProtectionManager` and `PulseGuardReactive`.
- `PulseGuardReactive.react()` / evaluation: skip policies where `block.timestamp > expiresAt`.
- Mirror state transitions for cancel/expire/execute already exist — verify they cover all terminal states.

**Tests:** Reactive ignores expired mirrored policy; mirror updated on all lifecycle events.

## Phase 4 — Reject unsupported assets (P1)

**Problem:** `executePolicy()` marks non-vault-asset policies `EXECUTED` without transferring funds.

**Changes:**
- `ProtectionManager.createPolicy()`: require `p.asset == address(vault.asset())`; revert otherwise.
- Remove or gate the unsupported-asset branch in `executePolicy()`.

**Tests:** createPolicy reverts for unsupported asset.

## Phase 5 — cancelPolicy double-decrement (P1)

**Problem:** `executePolicy()` decrements `_livePolicyCount` on expiry; `cancelPolicy()` permits cancelling an already-expired policy and decrements again → underflow / corrupt accounting.

**Changes:**
- `cancelPolicy()`: reject terminal states (`EXPIRED`, `EXECUTED`, `CANCELLED`).
- Audit all status transitions for exactly-once `_livePolicyCount` decrement.

**Tests:** cancel after expiry reverts; live count correct across lifecycle.

## Phase 6 — Event correlation & latency (P1)

**Problem:** Activity page picks "latest price event before callback" which may belong to a different asset; single latency number conflates stages.

**Changes:**
- Include originating event tx hash + log index in Reactive lifecycle events (`CallbackRequested`, execution events).
- Activity page: correlate by tx hash/log index, not timestamp proximity.
- UI: show origin→Reactive, Reactive→destination, and total latency separately.

## Phase 7 — Deployment reproducibility (P1)

**Problem:** `PulseGuardReactive.setExecutorForChain()` is not configured by `Configure.s.sol` or documented.

**Changes:**
- Add Lasna executor-mapping step to `docs/DEPLOYMENT.md` (and optionally `Configure.s.sol`).
- Record configuration tx hashes in deployment docs.

## Phase 8 — Frontend polish (P2)

- Surface approval/deposit errors explicitly in `useContracts.ts` async flow.
- Validate policy form: thresholds, numeric inputs, protected amount ≤ available balance.
- Label Unichain destination as "attestation + manual settlement" in UI copy.

## Phase 9 — Tests & docs reconciliation (P0 for submission)

- Add regression tests for Phases 1–5.
- Reconcile README "35 tests" vs quality-gates "30/30".
- Run `forge test` + `pnpm build`; update docs with real counts.

## Phase 10 — Fresh demo (final)

- Record: user deposits → creates funded policy → trigger → genuine automated vault exit on Base Sepolia.
- Update `docs/DEMO_SCRIPT.md` with new tx hashes.

## Execution order

Phases 1–5 are contract changes — do them together in one contracts pass, then run `forge test`. Phases 6–8 are frontend/docs. Phase 9 gates submission. Phase 10 last.
