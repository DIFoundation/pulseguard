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

## Evidence — live runs (2026-11-15, Base Sepolia / Reactive Lasna / Unichain Sepolia)

Two full end-to-end runs executed through the frontend UI. Timestamps are block timestamps (UTC).

### Run 1 — Base Sepolia destination (policy #1, STOP_LOSS, threshold $1,900)

| Step | Chain | Tx | Block | Time (UTC) |
|---|---|---|---|---|
| Policy created + activated + mirror sync | Base Sepolia | [`0x27a89754…c2cbf5`](https://sepolia.basescan.org/tx/0x27a89754b335cbb33859cf5e065cc0068c90666843df3dea51ec1b7499c2cbf5) | 59013564 | 06:36:21 |
| Policy mirrored on Lasna | Reactive Lasna | [`0x330bd2e8…1604`](https://lasna.reactscan.net/tx/0x330bd2e8ea187411e88652b59e545d75d872b40074b2ebc7c73c197c04b01604) | 8388317 | 06:36:20 |
| Price published $1,950 — **no trigger** (control) | Base Sepolia | [`0x19b4f371…ed1e37`](https://sepolia.basescan.org/tx/0x19b4f371ac2dd51749852ff2d2c9b3c0c4eedc4b1c227ca43c547b047ded1e37) | 59014894 | 06:40:47 |
| Price published $1,890 — **trigger** | Base Sepolia | [`0xd6ed3346…f70ef`](https://sepolia.basescan.org/tx/0xd6ed3346a37cd972335669208a57470f93192467ee03a14e3f009c46723f70ef) | 59015124 | 06:41:33 |
| `TriggerEvaluated` + `CallbackRequested` | Reactive Lasna | [`0xe5a70271…46ce`](https://lasna.reactscan.net/tx/0xe5a70271e17b5d40d1fb5513d4f489619e4bfcf75f221782ca27cf21b03446ce) | 8388611 | 06:41:33 |
| `PolicyExecuted` + `CallbackReceived` + `ProtectionExecuted` + vault `ProtectedExit` (10 tokens) | Base Sepolia | [`0x5fa7345e…df08a`](https://sepolia.basescan.org/tx/0x5fa7345eee6dd2786dcb2c329367cf023e95323a74fc20a4ada17aefe80df08a) | 59015133 | 06:41:35 |

**Latency: ~2s** from triggering `PriceUpdated` (06:41:33) to `ProtectedExit` (06:41:35). Policy #1 final state: `EXECUTED`.

### Run 2 — Unichain Sepolia destination (policy #2, STOP_LOSS, threshold $1,900)

| Step | Chain | Tx | Block | Time (UTC) |
|---|---|---|---|---|
| Policy created + activated + mirror sync | Base Sepolia | [`0x2a6749fc…a1e6`](https://sepolia.basescan.org/tx/0x2a6749fca7bf2e029ff45576ea469284ee28786e84b5e4460ee12aedbd43a1e6) | 59023783 | 07:10:25 |
| Policy mirrored on Lasna | Reactive Lasna | [`0xbb5d701e…1f77`](https://lasna.reactscan.net/tx/0xbb5d701e383fb71eee7e7486673fca7e66d8be7d54d112c12d3c372a86691f77) | 8390231 | 07:10:24 |
| Price published $1,890 — **trigger** | Base Sepolia | [`0x35fe4ae6…ac43`](https://sepolia.basescan.org/tx/0x35fe4ae6a3c0ea35d79889082c2f4572af3c16ea85b93863171569994945ac43) | 59024323 | 07:12:13 |
| `TriggerEvaluated` + `CallbackRequested` | Reactive Lasna | [`0xa3118965…37ce`](https://lasna.reactscan.net/tx/0xa3118965d7020b54456673cd79531fc587f8c9f24c1e8486fb6c5f9d30b237ce) | 8390333 | 07:12:12 |
| `CrossChainProtectionRecorded` — verifiable attestation | Unichain Sepolia | [`0xf2951745…00a9`](https://sepolia.uniscan.xyz/tx/0xf2951745df0b63a3b3b8b917e09f2d13ec74345575651ab42ad0b9e92d4b00a9) | 67874307 | 07:12:15 |

**Latency: ~2s** from triggering `PriceUpdated` (07:12:13) to on-chain attestation (07:12:15).

> **Attestation semantics (honest labeling):** the Unichain leg records a *verifiable attestation* that the trigger fired — it does **not** execute a vault exit. Vault exits only happen for policies whose destination is Base Sepolia (Run 1). Policy #2 therefore remains `ACTIVE` on `ProtectionManager` until expiry/cancel; the attestation is proof-of-trigger, not proof-of-execution.

## Evidence — live runs (2026-11-17, post-remediation redeploy)

Contracts redeployed after remediation: `PulseGuardReactive` `0xdE25…0C7b` (Lasna, funded at deploy), `ProtectionExecutor` `0x35Ad…bDC8` (Base), `CrossChainExecutor` `0xD931…F4B0` (Unichain). Both destination paths verified end-to-end via `cast`.

### Run 3 — Base Sepolia destination (policy #3, STOP_LOSS, threshold $1,800)

| Step | Chain | Tx | Block | Time (UTC) |
|---|---|---|---|---|
| Policy created + mirror sync | Base Sepolia | [`0x7f4d82c4…c646b`](https://sepolia.basescan.org/tx/0x7f4d82c4eea1873830db63b4d83d6d8e640861f9eebb2fd4e2968edd605c646b) | — | — |
| Policy mirrored on Lasna | Reactive Lasna | (delivered via subscription) | — | — |
| Price published $1,730 — **trigger** | Base Sepolia | [`0x46fba7cb…f71153`](https://sepolia.basescan.org/tx/0x46fba7cb852256fd0b69a339c0a2b7e9bc653429a109d3a6d618855622f71153) | 60094042 | — |
| `TriggerEvaluated` + `CallbackRequested` | Reactive Lasna | [`0xa686ea30…812e4`](https://lasna.reactscan.net/tx/0xa686ea306d9a2789d244b6ffa718c16d6f2dda501e50e7cac60650a0278812e4) | — | — |
| `ProtectionExecuted` + vault `ProtectedExit` (5 tokens) | Base Sepolia | [`0xd0e53d73…22052`](https://sepolia.basescan.org/tx/0xd0e53d73c5d4198d8b11baae6d487c64bb4063705bec2c1174339a5facc22052) | ~60094250 | — |

Policy #3 final state: `EXECUTED`. Vault exit verified on-chain: deployer balance 905 → vault 95 → after exit deployer 910 / vault 90 (policy #4 also settled, see Run 4).

### Run 4 — Unichain Sepolia destination + relay settlement (policy #4, STOP_LOSS, threshold $1,800)

| Step | Chain | Tx | Block | Time (UTC) |
|---|---|---|---|---|
| Policy created (`destinationChainId=1301`) + mirror sync | Base Sepolia | [`0x6a7c9766…fb10e2`](https://sepolia.basescan.org/tx/0x6a7c97664b9a7e7f9a5685ed4f960582ed8d9bda77c16889f1fe0aca25fb10e2) | — | — |
| Policy mirrored on Lasna | Reactive Lasna | (delivered via subscription) | — | — |
| Price published $1,720 — **trigger** | Base Sepolia | [`0xe1864fbc…099fac`](https://sepolia.basescan.org/tx/0xe1864fbcec732d2de4de7b3bfa6c7a4fdd7fddde0617ccbe1521afa6f2099fac) | 60114458 | — |
| `TriggerEvaluated` + `CallbackRequested` (dest 1301) | Reactive Lasna | [`0x4185bc47…88c003`](https://lasna.reactscan.net/tx/0x4185bc47716e4970216483ad1bc190f1a6b3daf82edc225e76522fcd0888c003) | — | — |
| `CrossChainProtectionRecorded` — attestation `0x4500…6551`, `verifyAttestation → true` | Unichain Sepolia | [`0x884627e9…057c5f`](https://sepolia.uniscan.xyz/tx/0x884627e95070fba13bcde29f7ef9935697c9ed780a10b7772060ab65db057c5f) | 68093548+ | — |
| `SettlementRelay.settle(4)` → `executePolicy` → `EXECUTED` + vault exit (5 tokens) | Base Sepolia | [`0xfdb1d5f2…cf0f7c`](https://sepolia.basescan.org/tx/0xfdb1d5f28525625a2710787832fe888b875dd348162a7358444dabadf5cf0f7c) | — | — |

**Unichain flow:** attestation on Unichain proves the trigger fired; settlement is a separate permissionless `SettlementRelay.settle(policyId)` call on Base that re-validates status/expiry/price/trigger on-chain before executing the vault exit. Policy #4 final state: `EXECUTED`.

> **Deployment note:** `PulseGuardReactive` must hold a REACT balance at deploy time — constructor `SYSTEM.subscribe` calls do not register for unfunded contracts. `DeployReactive.s.sol` now funds via `REACTIVE_FUNDING` (default 0.3 REACT). Executors bind `_CALLBACK_SENDER` immutably, so redeploying the reactive contract requires redeploying both executors.
