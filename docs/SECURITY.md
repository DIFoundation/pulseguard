# Security

Testnet hackathon prototype — **not audited**. Do not use with real funds.

## Threat model & mitigations

| Threat | Mitigation |
|---|---|
| Reentrancy | `nonReentrant` on vault deposit/withdraw/protectedExit, manager executePolicy; checks-effects-interactions |
| Unauthorized withdrawal | `protectedExit` restricted to registered executor; funds go to policy `recipient`, never executor |
| Forged callbacks | `onlyServiceProvider` (must be callback proxy) + `onlyCallbackSender` (must be authorized reactive contract) |
| Malicious callback params | Executor only forwards `policyId`; manager re-validates policy, status, and live trigger price |
| Duplicate execution | Reactive dedup `keccak256(txHash, logIndex, policyId)` **plus** per-policy `callbackRequestedForPolicy` latch (one callback request per activation cycle — repeated price updates can't burn callback gas); manager status transition ACTIVE→EXECUTED is atomic; second call reverts |
| Replay | Same dedup + status machine; CrossChainExecutor idempotent per policyId; `SettlementRelay.settle()` replay reverts via `PolicyNotActive` |
| Unbounded evaluation cost | `ProtectionManager._policiesByAsset` and `PulseGuardReactive._mirrorByAsset` hold **active policies only** — swap-and-pop removal on every terminal/deactivated transition, so `react()`/evaluation cost stays bounded by `MAX_POLICIES_PER_ASSET` regardless of history |
| Stuck reservations | `expirePolicy(id)` is permissionless — anyone can expire a policy past `expiresAt` (ACTIVE or deactivated CREATED), releasing the owner's reserved vault balance exactly once; `createPolicy` rejects already-expired `expiresAt` and non-`PROTECTED_EXIT` actions |
| Wrong event decoding | `opCode==2` check, chainId/contract/topic0 validation, non-matching events return early (no revert) |
| Wrong chain IDs | `originChainId` immutable; subscription pinned to chain+contract+topic0 |
| Stale/manipulated price | Mock oracle is operator-gated; `executePolicy` rejects prices older than `MAX_PRICE_AGE` (1h) via `StalePrice`; production mode would use Chainlink-style feed with heartbeat checks (documented, not implemented) |
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

- **Policy mirroring**: `PulseGuardReactive` keeps an event-synced mirror of *active* policies via `PolicyMirrorSync` (cannot do cross-chain view calls), stored in bounded per-asset arrays. Mirror drift is possible if events are missed; the manager/executor is authoritative — a missed sync only delays a callback, it cannot cause an unauthorized execution.
- **Manual settlement for Unichain policies**: `SettlementRelay.settle()` is permissionless and does **not** require the Unichain attestation — it re-validates the trigger on Base via `manager.executePolicy`. The attestation (`CrossChainExecutor.executedPolicies`) proves the Reactive callback fired cross-chain; it is evidence, not a settlement precondition.
- **Single-asset vault**: `executePolicy` only moves funds when `policy.asset == vault.asset()`; other assets mark EXECUTED without transfer (documented).
- **Cross-chain attestation only**: `CrossChainExecutor` on Unichain records a verifiable attestation of the protection event — it does not move assets. Asset movement happens on Base Sepolia via `ProtectionExecutor`. Attestations are tamper-evident (`verifyAttestation`) but carry no funds.
- **Policy cap**: `MAX_POLICIES_PER_ASSET` (50) counts live policies only — terminal policies (EXECUTED/CANCELLED/EXPIRED) free their slot.
- **Mock oracle**: prices are operator-published, not market data.
- **No independent audit**.
