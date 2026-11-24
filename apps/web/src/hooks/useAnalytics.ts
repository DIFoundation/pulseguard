"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchProtocolEvents, type ProtocolEvent } from "@/lib/protocolEvents";

export interface PricePoint {
  t: number; // unix seconds
  price: number;
}

export interface ChainCount {
  chain: string;
  count: number;
}

export interface TypeCount {
  name: string;
  count: number;
}

export interface LatencyStats {
  count: number;
  avg: number;
  min: number;
  max: number;
}

export interface ProtocolAnalytics {
  events: ProtocolEvent[];
  loading: boolean;
  error: string | null;
  priceSeries: PricePoint[];
  eventsByChain: ChainCount[];
  eventsByType: TypeCount[];
  policyStats: { created: number; executed: number; cancelled: number; expired: number; other: number };
  executionCount: number;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  totalProtectedOut: bigint;
  latency: LatencyStats | null;
  recentEvents: ProtocolEvent[];
}

const EXECUTION_EVENTS = new Set(["ProtectionExecuted"]);

export function useProtocolAnalytics(refreshMs = 60_000): ProtocolAnalytics {
  const [events, setEvents] = useState<ProtocolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const evts = await fetchProtocolEvents();
        if (!cancelled) {
          setEvents(evts);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshMs]);

  return useMemo(() => {
    // Price series from PriceUpdated events (chronological)
    const priceSeries: PricePoint[] = events
      .filter((e) => e.eventName === "PriceUpdated" && e.price !== undefined && e.timestamp !== undefined)
      .map((e) => ({ t: e.timestamp!, price: e.price! }))
      .sort((a, b) => a.t - b.t);

    // Events by chain
    const chainMap = new Map<string, number>();
    for (const e of events) chainMap.set(e.chain, (chainMap.get(e.chain) ?? 0) + 1);
    const eventsByChain: ChainCount[] = [...chainMap.entries()]
      .map(([chain, count]) => ({ chain, count }))
      .sort((a, b) => b.count - a.count);

    // Events by type (top-level grouping)
    const typeMap = new Map<string, number>();
    for (const e of events) {
      const group = e.eventName.startsWith("Policy") ? "Policy Lifecycle"
        : e.eventName === "PriceUpdated" ? "Price Updates"
        : EXECUTION_EVENTS.has(e.eventName) ? "Executions"
        : e.eventName === "CrossChainProtectionRecorded" ? "Cross-chain Attestations"
        : ["Deposited", "Withdrawn", "ProtectedExit"].includes(e.eventName) ? "Vault"
        : "Reactive";
      typeMap.set(group, (typeMap.get(group) ?? 0) + 1);
    }
    const eventsByType: TypeCount[] = [...typeMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Policy lifecycle stats
    let created = 0, executed = 0, cancelled = 0, expired = 0, other = 0;
    for (const e of events) {
      switch (e.eventName) {
        case "PolicyCreated": created++; break;
        case "PolicyExecuted": executed++; break;
        case "PolicyCancelled": cancelled++; break;
        case "PolicyExpired": expired++; break;
        case "PolicyActivated": case "PolicyDeactivated": case "PolicyMirrorSync": break;
        default: break;
      }
    }
    other = events.filter((e) => e.eventName.startsWith("Policy") && !["PolicyCreated","PolicyExecuted","PolicyCancelled","PolicyExpired","PolicyActivated","PolicyDeactivated","PolicyMirrorSync"].includes(e.eventName)).length;

    const executionCount = events.filter((e) => e.eventName === "ProtectionExecuted" && e.chain === "Base Sepolia").length;

    // Token volumes
    let totalDeposited = 0n, totalWithdrawn = 0n, totalProtectedOut = 0n;
    for (const e of events) {
      if (e.amount === undefined) continue;
      if (e.eventName === "Deposited") totalDeposited += e.amount;
      else if (e.eventName === "Withdrawn") totalWithdrawn += e.amount;
      else if (e.eventName === "ProtectedExit") totalProtectedOut += e.amount;
    }

    // Latency correlation:
    // PriceUpdated -> TriggerEvaluated / CallbackRequested -> ProtectionExecuted.
    //
    // The Reactive events carry the exact origin transaction hash and log index.
    // This prevents unrelated price updates from being paired with executions.
    const priceByOriginKey = new Map<string, ProtocolEvent>();

    for (const e of events) {
      if (
        e.eventName === "PriceUpdated" &&
        e.originKey &&
        e.timestamp !== undefined
      ) {
        priceByOriginKey.set(e.originKey, e);
      }
    }

    // Keep all callbacks per policy because a policy can be deactivated and
    // reactivated, producing another callback during a later activation cycle.
    const callbacksByPolicy = new Map<string, ProtocolEvent[]>();

    for (const e of events) {
      if (
        (e.eventName !== "CallbackRequested" &&
          e.eventName !== "TriggerEvaluated") ||
        !e.policyId ||
        !e.originKey ||
        e.timestamp === undefined
      ) {
        continue;
      }

      const callbacks = callbacksByPolicy.get(e.policyId) ?? [];
      callbacks.push(e);
      callbacksByPolicy.set(e.policyId, callbacks);
    }

    const latencies: number[] = [];

    for (const execution of events) {
      // Only measure successful Base protection executions.
      if (
        execution.eventName !== "ProtectionExecuted" ||
        execution.chain !== "Base Sepolia" ||
        !execution.policyId ||
        execution.timestamp === undefined
      ) {
        continue;
      }

      const callbacks = callbacksByPolicy.get(execution.policyId) ?? [];

      // Select the latest valid callback before this execution, and prefer
      // CallbackRequested when both Reactive stages share the same timestamp.
      const matchingCallbacks = callbacks
        .filter((callback) => {
          if (callback.timestamp === undefined) return false;
          if (callback.timestamp > execution.timestamp!) return false;

          const price = priceByOriginKey.get(callback.originKey!);

          return (
            price !== undefined &&
            price.timestamp !== undefined &&
            price.timestamp <= callback.timestamp!
          );
        })
        .sort((a, b) => {
          const timeDifference = b.timestamp! - a.timestamp!;

          if (timeDifference !== 0) return timeDifference;

          if (a.eventName === b.eventName) return 0;

          return a.eventName === "CallbackRequested" ? -1 : 1;
        });

      const callback = matchingCallbacks[0];
      if (!callback?.originKey) continue;

      const price = priceByOriginKey.get(callback.originKey);

      if (!price || price.timestamp === undefined || callback.timestamp === undefined) {
        continue;
      }

      const originToReactive = callback.timestamp - price.timestamp;
      const reactiveToDestination = execution.timestamp - callback.timestamp;
      const totalLatency = execution.timestamp - price.timestamp;

      // Reject invalid or implausibly long measurements.
      if (
        originToReactive < 0 ||
        reactiveToDestination < 0 ||
        totalLatency < 0 ||
        totalLatency >= 86400
      ) {
        continue;
      }

      latencies.push(totalLatency);
    }

    const latency: LatencyStats | null = latencies.length
      ? {
          count: latencies.length,
          avg: Math.round(
            latencies.reduce((total, value) => total + value, 0) / latencies.length
          ),
          min: Math.min(...latencies),
          max: Math.max(...latencies),
        }
      : null;

    const recentEvents = events.slice(0, 8);

    return {
      events,
      loading,
      error,
      priceSeries,
      eventsByChain,
      eventsByType,
      policyStats: { created, executed, cancelled, expired, other },
      executionCount,
      totalDeposited,
      totalWithdrawn,
      totalProtectedOut,
      latency,
      recentEvents,
    };
  }, [events, loading, error]);
}
