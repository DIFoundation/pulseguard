# Reactive Network Integration

Verified against https://dev.reactive.network/ (Nov 2026) and `reactive-lib-omni` @ `3ade0dc`.

## Library

- Repo: `Reactive-Network/reactive-lib-omni` (Foundry git dep, installed via `forge install`)
- Remapping: `@reactive/=lib/reactive-lib-omni/`
- Solidity: `^0.8.29`, `via_ir = true`

## Key addresses (testnet)

| Item | Value |
|---|---|
| SYSTEM (Lasna) | `0x8888888888888888888888888888888888888888` |
| Base Sepolia callback proxy | `0x476F44b11F5C942c58f4c8E3d0300E5710743585` |
| Unichain Sepolia callback proxy | `0x775c9B990ADe401060B78D0e98684eEf8d2466C1` |
| Lasna RPC | `https://lasna-rpc.rnk.dev/` |
| Lasna chain ID | `5318007` |

## Base contracts used

- `AbstractReactive` → `SYSTEM`, `REACTIVE_IGNORE`, `onlySystem`, abstract `react(LogRecord)`.
- `AbstractCallback(callbackProxy_, callbackSender_)` → `onlyServiceProvider`, `onlyCallbackSender(addr)`.
- `ISystemContract.requestCallbackV_1_0(CallbackConfiguration_V_1_0{chainId, recipient, gasLimit, payload})`.

## Subscription

Constructor subscribes once:

```solidity
SYSTEM.subscribe(originChainId, priceFeed, priceTopic0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
```

`priceTopic0 = uint256(keccak256("PriceUpdated(address,uint256,uint256)"))`.

## LogRecord decoding

`PriceUpdated(address indexed asset, uint256 price, uint256 timestamp)` → `opCode == 2` (topic0 + 1 indexed), `topic1 = asset`, `data = abi.encode(price, timestamp)`.

## Callback payload

First arg must be `address(0)` placeholder — the proxy overwrites it with the reactive contract address:

```solidity
abi.encodeWithSignature("executeProtection(address,uint256)", address(0), policyId)
abi.encodeWithSignature("recordProtection(address,uint256,uint256)", address(0), policyId, price)
```

`gasLimit = 500_000` (proxy withholds overhead on top).

## Deployment order (mandatory)

1. Deploy origin contracts (Base Sepolia): token, feed, vault, manager.
2. Deploy `PulseGuardReactive` on Lasna (constructor subscribes).
3. Deploy `ProtectionExecutor` on Base Sepolia with `(baseProxy, reactiveAddress, manager)`.
4. Deploy `CrossChainExecutor` on Unichain Sepolia with `(uniProxy, reactiveAddress)`.
5. `manager.setExecutorForChain(84532, baseExecutor)`, `setExecutorForChain(1301, uniExecutor)`, `setReactiveContract(reactive)`.
6. `vault.setExecutor(manager)`.
7. `reactive.setExecutorForChain(...)` for each destination.
8. Fund: reactive contract with REACT on Lasna; executors with native token on their chains.

## Funding & debt

- Reactive contract pays for `react()` transactions in REACT on Lasna. Top up via plain transfer (`receive()` payable) or `SYSTEM.depositTo`.
- Callback recipients pay for callback execution in destination native currency. A recipient in debt receives nothing; failed callbacks still cost.
- `coverDebt()` exposed on both executors to settle proxy debt from contract balance.

## Local testing

`react()` is `onlySystem` (msg.sender must be `0x8888…`). Tests deploy `MockSystemContract` and `vm.etch` it at the SYSTEM address, then `vm.prank(SYSTEM)` to simulate delivery. Executor auth is tested with a `MockCallbackProxy`.
