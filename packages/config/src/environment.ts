export const environment = {
  reownProjectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "",
  baseSepoliaRpc: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
  unichainSepoliaRpc: process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL ?? "https://sepolia.unichain.org",
  lasnaRpc: process.env.LASNA_RPC_URL ?? "https://lasna-rpc.rnk.dev/",
  isProduction: process.env.NODE_ENV === "production",
};
