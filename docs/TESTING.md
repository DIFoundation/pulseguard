# Testing

## Smart contracts (Foundry)

```bash
cd contracts
forge test -vv
```

35 tests across 5 suites:

| Suite | Tests | Coverage |
|---|---|---|
| PulseGuardVault | 7 | deposit, withdraw, protectedExit auth, pause, reentrancy |
| ProtectionManager | 10 | policy CRUD, all trigger types, dedup, auth, expiry |
| ProtectionExecutor | 6 | callback auth, forged sender rejection, duplicate rejection, cross-chain attestation |
| PulseGuardReactive | 11 | onlySystem, irrelevant events, all triggers, dedup, deactivation, auto-mirror sync |
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

## Quality gates status

- [x] `forge test` — 30/30 pass
- [x] `tsc --noEmit` — clean
- [x] `next build` — all 9 routes prerender
- [~] Live testnet E2E — contracts deployed; demo flow rehearsal in progress
