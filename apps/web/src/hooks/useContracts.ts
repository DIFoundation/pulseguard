"use client";

import { useConnection, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { baseSepolia, deployments, isConfigured } from "@pulseguard/config";
import { PulseGuardVaultAbi, ProtectionManagerAbi, MockPriceFeedAbi } from "@pulseguard/abi";
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
    query: { enabled: !!address && isConfigured("vault") },
  });

  const totalDeposits = useReadContract({
    abi: PulseGuardVaultAbi,
    address: isConfigured("vault") ? vaultAddr : undefined,
    functionName: "totalDeposits",
    chainId: baseSepolia.id,
    query: { enabled: isConfigured("vault") },
  });

  const { writeContract, writeContractAsync, data: txHash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const [flowStep, setFlowStep] = useState<"idle" | "approving" | "depositing">("idle");
  const [flowHash, setFlowHash] = useState<`0x${string}` | undefined>();
  const flowReceipt = useWaitForTransactionReceipt({ hash: flowHash });

  const allowance = useReadContract({
    abi: erc20Abi,
    address: isConfigured("vault") && isConfigured("testToken") ? tokenAddr : undefined,
    functionName: "allowance",
    args: address ? [address, vaultAddr] : undefined,
    chainId: baseSepolia.id,
    query: { enabled: !!address && isConfigured("vault") && isConfigured("testToken") },
  });

  /// @dev Two-step deposit: approve the vault for the asset if needed, then deposit.
  const depositWithApproval = async (amount: bigint) => {
    if (!publicClient || !address || amount === 0n) return;
    try {
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
    } catch {
      // user rejected or tx failed — error surfaces via useWriteContract state
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

  return { balance, totalDeposits, deposit, depositWithApproval, withdraw, allowance, flowStep, flowHash, flowReceipt, isPending, txHash, receipt, error, tokenAddr };
}

export function usePolicies() {
  const { address } = useConnection();
  const managerAddr = deployments.protectionManager.address as `0x${string}`;

  const nextId = useReadContract({
    abi: ProtectionManagerAbi,
    address: isConfigured("protectionManager") ? managerAddr : undefined,
    functionName: "nextPolicyId",
    chainId: baseSepolia.id,
    query: { enabled: isConfigured("protectionManager") },
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

  return { nextId, createPolicy, deactivate, cancel, isPending, txHash, receipt, error };
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
