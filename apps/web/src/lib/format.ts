import { formatEther, formatUnits } from "viem";

/// @dev Shared display formatting for prices, token amounts, addresses, and hashes.

/** Format an 8-decimal oracle price as USD, e.g. "$70.00". */
export function formatPrice(value: bigint | number | string, decimals = 8): string {
  const raw = typeof value === "bigint" ? formatUnits(value, decimals) : value;
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format an 18-decimal token amount, trimmed to 4 decimals, e.g. "500.0". */
export function formatTokenAmount(value: bigint | number | string): string {
  const n = typeof value === "bigint" ? Number(formatEther(value)) : Number(value);
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Shorten an address/hash to 0x1234…abcd. */
export function shortHex(value: string, head = 6, tail = 4): string {
  if (!value) return "—";
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export const shortAddress = (a?: string | null) => shortHex(a ?? "", 6, 4);
export const shortHash = (h?: string | null) => shortHex(h ?? "", 10, 6);
