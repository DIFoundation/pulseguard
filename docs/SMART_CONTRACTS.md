# Smart Contracts

Solidity 0.8.29, Foundry, OpenZeppelin 5.4, reactive-lib-omni.

## Contracts

| Contract | File | Key functions |
|---|---|---|
| PulseGuardVault | `src/vault/` | `deposit`, `withdraw`, `protectedExit` (executor-only), `pause` |
| ProtectionManager | `src/protection/` | `createPolicy`, `deactivatePolicy`, `activatePolicy`, `cancelPolicy`, `executePolicy`, `triggeredPolicies`, `callbackTarget` |
| ProtectionExecutor | `src/protection/` | `executeProtection` (`onlyServiceProvider onlyCallbackSender`) |
| CrossChainExecutor | `src/protection/` | `recordProtection` (idempotent) |
| PulseGuardReactive | `src/reactive/` | `react` (`onlySystem`), `mirrorPolicy`, `setExecutorForChain` |
| MockPriceFeed | `src/oracle/` | `updatePrice` (operator-only), `latestPrice` |
| MockERC20 | `test/mocks/` | test asset |

## Design notes

- Custom errors throughout (`ProtectionErrors`).
- Events for all state changes.
- Checks-effects-interactions + `nonReentrant`.
- Policy state machine: CREATED/ACTIVE/TRIGGERED/EXECUTED/CANCELLED/EXPIRED/FAILED.
- Executor never trusted: manager re-validates trigger against live feed price.
- Reactive contract is stateless w.r.t. funds; only mirrors policy params for evaluation.
