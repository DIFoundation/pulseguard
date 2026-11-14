"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { baseSepolia, unichainSepolia, environment } from "@pulseguard/config";
import { wagmiAdapter, wagmiConfig } from "./wagmi";
import { useState, type ReactNode } from "react";

const projectId = environment.reownProjectId || "pulseguard-dev";

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [baseSepolia, unichainSepolia],
  metadata: {
    name: "PulseGuard",
    description: "Autonomous cross-chain DeFi protection powered by Reactive Network",
    url: "https://pulseguard.dev",
    icons: [],
  },
  features: { analytics: false },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
