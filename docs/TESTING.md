# Testing

## Smart contracts (Foundry)

```bash
cd contracts
forge test -vv
```

49 tests across 5 suites:

| Suite | Tests | Coverage |
|---|---|---|
| PulseGuardVault | 11 | deposit, withdraw, protectedExit auth, reservation accounting, pause, reentrancy |
| ProtectionManager | 17 | policy CRUD, all trigger types, reservation enforcement, unsupported-asset rejection, expiry, cancel-on-terminal revert |
| ProtectionExecutor | 7 | callback auth, forged sender rejection, duplicate rejection, expired-callback event semantics, cross-chain attestation |
| PulseGuardReactive | 13 | onlySystem, irrelevant events, all triggers, dedup, deactivation, auto-mirror sync, expiresAt handling |
| ProtectionIntegration | 1 | full lifecycle: event → react → callback → execution |

Reactive tests use `MockSystemContract` etched at `0x8888…` and `vm.prank(SYSTEM)`.

## Frontend

```bash
pnpm --filter web typecheck   # tsc --noEmit
pnpm --filter web lint        # eslint
pnpm --filter web build       # next build (all routes prerender)
```

## End-to-end (testnet)

See `docs/DEMO_SCRIPT.md`. Contracts are deployed on all three chains (see `deployments/*.json`); the activity page reads live events from Base Sepolia and Unichain Sepolia via Blockscout.

## Fresh-wallet UX validation (manual)

Run with a wallet that has **no prior allowance** to the vault. Checklist:

- [ ] Deposit without previous allowance — approval tx fires first, then deposit succeeds
- [ ] Create a policy as ordinary user — appears in `/policies` list
- [ ] Policy auto-mirrors to Reactive (check `mirrorPolicies(id)` on Lasna or `PolicyMirrored` event) — no manual tx
- [ ] Publish non-triggering price — policy stays ACTIVE, no callback
- [ ] Publish triggering price — Base vault exit executes automatically (Base destination)
- [ ] Deactivate/cancel a policy — mirror becomes inactive on Lasna (`PolicyMirrorSync` active=false)
- [ ] Create Unichain-destination policy — attestation lands on Unichain, Settle button visible, `SettlementRelay.settle` executes vault exit on Base
- [ ] Expired policy callback — emits `ProtectionNotExecuted`, no false `ProtectionExecuted`
- [ ] Duplicate callback — second delivery is a no-op (dedup via `_callbackRequested`)

## Quality gates status

- [x] `forge test` — 49/49 pass
- [x] `tsc --noEmit` — clean
- [x] `next build` — all 11 routes prerender
- [x] `pnpm --filter web lint` — 0 errors (13 warnings, unused vars)
- [x] Live testnet E2E — 4 runs documented in `docs/DEMO_SCRIPT.md` (Base + Unichain destinations, ~2-3s latency)
- [ ] Fresh-wallet UX pass — checklist above
