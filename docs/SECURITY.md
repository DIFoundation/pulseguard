# Security

Testnet hackathon prototype — **not audited**. Do not use with real funds.

## Threat model & mitigations

| Threat | Mitigation |
|---|---|
| Reentrancy | `nonReentrant` on vault deposit/withdraw/protectedExit, manager executePolicy; checks-effects-interactions |
| Unauthorized withdrawal | `protectedExit` restricted to registered executor; funds go to policy `recipient`, never executor |
| Forged callbacks | `onlyServiceProvider` (must be callback proxy) + `onlyCallbackSender` (must be authorized reactive contract) |
| Malicious callback params | Executor only forwards `policyId`; manager re-validates policy, status, and live trigger price |
| Duplicate execution | Reactive dedup `keccak256(txHash, logIndex, policyId)`; manager status transition ACTIVE→EXECUTED is atomic; second call reverts |
| Replay | Same dedup + status machine; CrossChainExecutor idempotent per policyId |
| Wrong event decoding | `opCode==2` check, chainId/contract/topic0 validation, non-matching events return early (no revert) |
| Wrong chain IDs | `originChainId` immutable; subscription pinned to chain+contract+topic0 |
| Stale/manipulated price | Mock oracle is operator-gated, nonzero enforced; production mode would use Chainlink-style feed with heartbeat checks (documented, not implemented) |
| Oracle decimals | Fixed 8 decimals in MockPriceFeed; thresholds stored in same units |
| Integer issues | Solidity 0.8.29 checked arithmetic; drawdown uses bps denominator 10_000 |
| Insufficient callback gas | `gasLimit=500_000`; proxy reserves overhead; failures surface as `CallbackFailure` |
| Funding exhaustion | Reactive funded in REACT; executors funded in native token; `coverDebt()` exposed; docs explain debt behavior |
| Policy state inconsistency | Single source of truth in ProtectionManager; executor re-reads state |
| Unauthorized policy modification | `owner == msg.sender` checks on all lifecycle functions |
| Front-running | Policy params fixed at creation; execution re-validates live price |
| Pause misuse | `onlyOwner` pause on vault + manager |
| Admin key compromise | Documented as centralization risk; testnet only |

## Known limitations

- **Policy mirroring**: `PulseGuardReactive` keeps an event-synced mirror of policies via `PolicyMirrorSync` (cannot do cross-chain view calls). Mirror drift is possible if events are missed; executor is authoritative.
- **Single-asset vault**: `executePolicy` only moves funds when `policy.asset == vault.asset()`; other assets mark EXECUTED without transfer (documented).
- **Mock oracle**: prices are operator-published, not market data.
- **No independent audit**.
