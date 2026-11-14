"use client";

import { useConnection, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { baseSepolia, deployments, isConfigured } from "@pulseguard/config";
import { PulseGuardVaultAbi, ProtectionManagerAbi, MockPriceFeedAbi } from "@pulseguard/abi";
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

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

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

  return { balance, totalDeposits, deposit, withdraw, isPending, txHash, receipt, error, tokenAddr };
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
