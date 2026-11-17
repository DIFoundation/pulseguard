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

## Quality gates status

- [x] `forge test` — 49/49 pass
- [x] `tsc --noEmit` — clean
- [x] `next build` — all 9 routes prerender
- [~] Live testnet E2E — contracts deployed; demo flow rehearsal in progress
