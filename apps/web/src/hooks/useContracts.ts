"use client";

import { useConnection, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { baseSepolia, deployments, isConfigured } from "@pulseguard/config";
import { PulseGuardVaultAbi, ProtectionManagerAbi, MockPriceFeedAbi, SettlementRelayAbi } from "@pulseguard/abi";
import { erc20Abi } from "viem";
import { useState } from "react";

export function useVault() {
  const { address } = useConnection();
  const vaultAddr = deployments.vault.address as `0x${string}`;
  const tokenAddr = deployments.testToken.address as `0x${string}`;

  const balance = useReadContract({
    abi: PulseGuardVaultAbi,
    address: isConfigured("vault") ? vaultAddr : undefined,
    functionName: "balances",
    args: address ? [address] : undefined,
    chainId: baseSepolia.id,
    query: { enabled: !!address && isConfigured("vault"), refetchInterval: 5000 },
  });

  const totalDeposits = useReadContract({
    abi: PulseGuardVaultAbi,
    address: isConfigured("vault") ? vaultAddr : undefined,
    functionName: "totalDeposits",
    chainId: baseSepolia.id,
    query: { enabled: isConfigured("vault"), refetchInterval: 5000 },
  });

  const availableBalance = useReadContract({
    abi: PulseGuardVaultAbi,
    address: isConfigured("vault") ? vaultAddr : undefined,
    functionName: "availableBalance",
    args: address ? [address] : undefined,
    chainId: baseSepolia.id,
    query: { enabled: !!address && isConfigured("vault"), refetchInterval: 5000 },
  });

  const { writeContract, writeContractAsync, data: txHash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const [flowStep, setFlowStep] = useState<
    "idle" | "checking" | "approving" | "approval-confirmed" | "depositing" | "deposit-confirmed"
  >("idle");
  const [flowHash, setFlowHash] = useState<`0x${string}` | undefined>();
  const [flowError, setFlowError] = useState<string | undefined>();
  const flowReceipt = useWaitForTransactionReceipt({ hash: flowHash });

  const allowance = useReadContract({
    abi: erc20Abi,
    address: isConfigured("vault") && isConfigured("testToken") ? tokenAddr : undefined,
    functionName: "allowance",
    args: address ? [address, vaultAddr] : undefined,
    chainId: baseSepolia.id,
    query: { enabled: !!address && isConfigured("vault") && isConfigured("testToken"), refetchInterval: 5000 },
  });

  /// @dev Two-step deposit: approve the vault for the asset if needed, then deposit.
  ///      Approval and deposit failures are surfaced via `flowError` — nothing is swallowed.
  const depositWithApproval = async (amount: bigint) => {
    if (!publicClient || !address || amount === 0n) return;
    setFlowError(undefined);
    try {
      setFlowStep("checking");
      const current = (await publicClient.readContract({
        abi: erc20Abi,
        address: tokenAddr,
        functionName: "allowance",
        args: [address, vaultAddr],
      })) as bigint;

      if (current < amount) {
        setFlowStep("approving");
        const approveHash = await writeContractAsync({
          abi: erc20Abi,
          address: tokenAddr,
          functionName: "approve",
          args: [vaultAddr, amount],
          chainId: baseSepolia.id,
        });
        setFlowHash(approveHash);
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        setFlowStep("approval-confirmed");
      }

      setFlowStep("depositing");
      const depositHash = await writeContractAsync({
        abi: PulseGuardVaultAbi,
        address: vaultAddr,
        functionName: "deposit",
        args: [amount],
        chainId: baseSepolia.id,
      });
      setFlowHash(depositHash);
      await publicClient.waitForTransactionReceipt({ hash: depositHash });
      setFlowStep("deposit-confirmed");
      // Refresh balances immediately instead of waiting for the poll interval.
      void balance.refetch();
      void availableBalance.refetch();
      void totalDeposits.refetch();
      void allowance.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // User rejection is not an error worth surfacing; real failures are.
      if (!msg.toLowerCase().includes("user rejected") && !msg.toLowerCase().includes("user denied")) {
        setFlowError(msg.slice(0, 200));
      }
    } finally {
      setFlowStep("idle");
    }
  };

  const deposit = (amount: bigint) =>
    writeContract({
      abi: PulseGuardVaultAbi,
      address: vaultAddr,
      functionName: "deposit",
      args: [amount],
      chainId: baseSepolia.id,
    });

  const withdraw = (amount: bigint) =>
    writeContract({
      abi: PulseGuardVaultAbi,
      address: vaultAddr,
      functionName: "withdraw",
      args: [amount],
      chainId: baseSepolia.id,
    });

  return { balance, availableBalance, totalDeposits, deposit, depositWithApproval, withdraw, allowance, flowStep, flowHash, flowReceipt, flowError, isPending, txHash, receipt, error, tokenAddr };
}

export function usePolicies() {
  const managerAddr = deployments.protectionManager.address as `0x${string}`;

  const nextId = useReadContract({
    abi: ProtectionManagerAbi,
    address: isConfigured("protectionManager") ? managerAddr : undefined,
    functionName: "nextPolicyId",
    chainId: baseSepolia.id,
    query: { enabled: isConfigured("protectionManager"), refetchInterval: 10000 },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const createPolicy = (policy: {
    owner: `0x${string}`;
    asset: `0x${string}`;
    monitoredAsset: `0x${string}`;
    destinationChainId: bigint;
    triggerType: number;
    threshold: bigint;
    referencePrice: bigint;
    maxDrawdownBps: bigint;
    protectedAmount: bigint;
    recipient: `0x${string}`;
    action: number;
    expiresAt: bigint;
  }) =>
    writeContract({
      abi: ProtectionManagerAbi,
      address: managerAddr,
      functionName: "createPolicy",
      args: [
        {
          id: 0n,
          owner: policy.owner,
          asset: policy.asset,
          monitoredAsset: policy.monitoredAsset,
          destinationChainId: policy.destinationChainId,
          triggerType: policy.triggerType,
          threshold: policy.threshold,
          referencePrice: policy.referencePrice,
          maxDrawdownBps: policy.maxDrawdownBps,
          protectedAmount: policy.protectedAmount,
          recipient: policy.recipient,
          action: policy.action,
          status: 0,
          createdAt: 0,
          expiresAt: policy.expiresAt,
          executedAt: 0,
        },
      ],
      chainId: baseSepolia.id,
    });

  const deactivate = (id: bigint) =>
    writeContract({ abi: ProtectionManagerAbi, address: managerAddr, functionName: "deactivatePolicy", args: [id], chainId: baseSepolia.id });
  const cancel = (id: bigint) =>
    writeContract({ abi: ProtectionManagerAbi, address: managerAddr, functionName: "cancelPolicy", args: [id], chainId: baseSepolia.id });
  // Permissionless on-chain; exposed here so owners can reclaim expired reservations.
  const expire = (id: bigint) =>
    writeContract({ abi: ProtectionManagerAbi, address: managerAddr, functionName: "expirePolicy", args: [id], chainId: baseSepolia.id });

  // Settle an attested/triggered policy on Base via the SettlementRelay
  // (registered as executorForChain for attestation-only destinations like Unichain).
  const relayAddr = deployments.settlementRelay.address as `0x${string}`;
  const settle = (id: bigint) =>
    writeContract({
      abi: SettlementRelayAbi,
      address: relayAddr,
      functionName: "settle",
      args: [id],
      chainId: baseSepolia.id,
    });

  return { nextId, createPolicy, deactivate, cancel, expire, settle, isPending, txHash, receipt, error };
}

export function usePriceFeed() {
  const feedAddr = deployments.priceFeed.address as `0x${string}`;
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const updatePrice = (asset: `0x${string}`, price: bigint) =>
    writeContract({
      abi: MockPriceFeedAbi,
      address: feedAddr,
      functionName: "updatePrice",
      args: [asset, price],
      chainId: baseSepolia.id,
    });

  return { updatePrice, isPending, txHash, receipt };
}
