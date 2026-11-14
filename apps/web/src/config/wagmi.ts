"use client";

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { http } from "viem";
import { baseSepolia, unichainSepolia, environment } from "@pulseguard/config";

export const wagmiAdapter = new WagmiAdapter({
  networks: [baseSepolia, unichainSepolia],
  projectId: environment.reownProjectId || "pulseguard-dev",
  transports: {
    [baseSepolia.id]: http(environment.baseSepoliaRpc),
    [unichainSepolia.id]: http(environment.unichainSepoliaRpc),
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
