import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["jsonwebtoken", "bcryptjs"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
