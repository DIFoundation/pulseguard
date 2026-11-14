# Technical Decisions

## TD-1: Reactive Omni, not legacy ReactVM
Use `AbstractReactive` / `AbstractCallback` from `reactive-lib-omni` (master). No `vmOnly`, no dual deployment, no legacy `Callback` event. Callbacks via `SYSTEM.requestCallbackV_1_0`.

## TD-2: Same-chain primary execution
Vault + ProtectionManager live on Base Sepolia. The reactive contract on Lasna subscribes to Base Sepolia `PriceUpdated` events and requests a callback **back to Base Sepolia** (`ProtectionExecutor`), so the protection action can actually move vault assets. A second callback targets Unichain Sepolia, where `CrossChainExecutor` records a verifiable on-chain attestation of the protection event (`getRecord`/`verifyAttestation`) — it never claims to move Base assets.

## TD-3: Policy state lives in ProtectionManager (origin chain)
The reactive contract is stateless w.r.t. policies except a dedup set. On `react()` it decodes the price, checks each active policy's threshold via view calls to ProtectionManager, and requests callbacks only for newly triggered policies. The executor re-validates everything on-chain (policy active, not executed, threshold still met) — the reactive contract is not trusted.

## TD-4: Executor authentication
`ProtectionExecutor` inherits `AbstractCallback`, constructor takes `(callbackProxy, callbackSender=PulseGuardReactive)`. Every callback method uses `onlyServiceProvider onlyCallbackSender(reactive_)`. Payload first arg = `address(0)` placeholder.

## TD-5: Dedup / replay
- Reactive side: `mapping(bytes32 => bool) _callbackRequested` keyed by `keccak256(chainId, txHash, logIndex, policyId)`.
- Executor side: policy status transition ACTIVE→EXECUTED is atomic; second callback reverts `PolicyNotActive`.

## TD-6: Vault custody
Non-custodial ERC-4626-style vault: users deposit ERC-20, balances tracked per user. Protection action = executor calls `vault.emergencyWithdraw(policyId)` which burns the user's vault shares and transfers underlying to a user-set `protectedRecipient` — never to an arbitrary address. Executor cannot withdraw to itself.

## TD-7: Mock oracle
`MockPriceFeed` (owner/operator-gated `updatePrice`) emits `PriceUpdated(address indexed asset, uint256 price, uint256 timestamp)`. 8 decimals, nonzero enforced. Clearly labeled MOCK; production mode would use a Chainlink-style `IPriceFeed` adapter — interface defined, not fabricated.

## TD-8: Frontend
Next.js 16 + wagmi + viem + Reown AppKit + Tailwind + shadcn-style components. Contract addresses/ABIs centralized in `packages/config` + generated artifacts. No ethers.js. pnpm.

## TD-9: Testing Reactive locally
`react()` is `onlySystem` (msg.sender must be SYSTEM precompile `0x8888...`). Unit tests use `vm.prank(SYSTEM)` to simulate delivery; a mock `ISystemContract` is not needed since SYSTEM is a precompile address — tests prank it and assert `CallbackRequest` effects via a mocked system is NOT possible on Lasna locally; instead we test payload encoding via `vm.recordLogs`/state and document that live verification happens on Lasna testnet. Executor callback auth is fully unit-tested with a mock proxy.

## Open questions / blockers
- Live testnet deployment requires `DEPLOYER_PRIVATE_KEY` + testnet ETH on Base Sepolia, Unichain Sepolia, and REACT on Lasna. Documented in DEPLOYMENT.md.
- Exact REACT faucet/funding route for Lasna — see economy docs; `depositTo()` on SYSTEM used for top-ups.
