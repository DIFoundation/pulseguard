import { defineChain } from "viem";

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"] },
  },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://sepolia.basescan.org" },
  },
  testnet: true,
});

export const unichainSepolia = defineChain({
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL ?? "https://sepolia.unichain.org"] },
  },
  blockExplorers: {
    default: { name: "Uniscan", url: "https://sepolia.uniscan.xyz" },
  },
  testnet: true,
});

/// @dev Reactive Lasna — monitoring/deployment only, NOT a user wallet network.
export const reactiveLasna = defineChain({
  id: 5318007,
  name: "Reactive Lasna",
  nativeCurrency: { name: "Reactive", symbol: "REACT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.LASNA_RPC_URL ?? "https://lasna-rpc.rnk.dev/"] },
  },
  blockExplorers: {
    default: { name: "ReactScan", url: "https://lasna.reactscan.net" },
  },
  testnet: true,
});

export const supportedChains = [baseSepolia, unichainSepolia] as const;
export const allChains = [baseSepolia, unichainSepolia, reactiveLasna] as const;

export const chainById: Record<number, typeof baseSepolia | typeof unichainSepolia | typeof reactiveLasna> = {
  84532: baseSepolia,
  1301: unichainSepolia,
  5318007: reactiveLasna,
};
