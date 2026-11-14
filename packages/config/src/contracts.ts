/// @dev Centralized contract configuration. Addresses are populated from
///      deployments/*.json after deployment. Empty string = not yet deployed.

export interface DeploymentInfo {
  address: string;
  chainId: number;
  txHash?: string;
  block?: number;
}

export const deployments: Record<string, DeploymentInfo> = {
  // Base Sepolia (84532) — filled from deployments/base-sepolia.json
  vault: { address: process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "", chainId: 84532 },
  protectionManager: { address: process.env.NEXT_PUBLIC_MANAGER_ADDRESS ?? "", chainId: 84532 },
  priceFeed: { address: process.env.NEXT_PUBLIC_FEED_ADDRESS ?? "", chainId: 84532 },
  protectionExecutor: { address: process.env.NEXT_PUBLIC_BASE_EXECUTOR ?? "", chainId: 84532 },
  testToken: { address: process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "", chainId: 84532 },
  // Unichain Sepolia (1301)
  crossChainExecutor: { address: process.env.NEXT_PUBLIC_UNI_EXECUTOR ?? "", chainId: 1301 },
  // Reactive Lasna (5318007)
  reactive: { address: process.env.NEXT_PUBLIC_REACTIVE_ADDRESS ?? "", chainId: 5318007 },
};

export function isConfigured(key: keyof typeof deployments): boolean {
  return deployments[key].address !== "" && deployments[key].address !== undefined;
}
