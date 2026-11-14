# Testing

## Smart contracts (Foundry)

```bash
cd contracts
forge test -vv
```

30 tests across 5 suites:

| Suite | Tests | Coverage |
|---|---|---|
| PulseGuardVault | 7 | deposit, withdraw, protectedExit auth, pause, reentrancy |
| ProtectionManager | 9 | policy CRUD, all trigger types, dedup, auth, expiry |
| ProtectionExecutor | 5 | callback auth, forged sender rejection, duplicate rejection, cross-chain record |
| PulseGuardReactive | 8 | onlySystem, irrelevant events, all triggers, dedup, deactivation |
| ProtectionIntegration | 1 | full lifecycle: event → react → callback → execution |

Reactive tests use `MockSystemContract` etched at `0x8888…` and `vm.prank(SYSTEM)`.

## Frontend

```bash
pnpm --filter web typecheck   # tsc --noEmit
pnpm --filter web lint        # eslint
pnpm --filter web build       # next build (all routes prerender)
```

## End-to-end (testnet)

See `docs/DEMO_SCRIPT.md`. Requires deployed contracts + funded wallets.

## Quality gates status

- [x] `forge test` — 30/30 pass
- [x] `tsc --noEmit` — clean
- [x] `next build` — all 9 routes prerender
- [ ] Live testnet E2E — pending deployment credentials
