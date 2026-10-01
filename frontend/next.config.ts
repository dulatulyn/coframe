import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8100";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  devIndicators: false,
  experimental: { proxyTimeout: 300_000 },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
