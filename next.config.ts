import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@mastra/core",
    "@mastra/observability",
    "@mastra/sentry",
    "@sentry/node",
    "@temporalio/client",
    "mongodb",
    "pg",
  ],
};

export default nextConfig;
