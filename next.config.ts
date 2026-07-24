import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // swisseph-wasm ships a .wasm binary; keep it external so Next bundles it for the server runtime.
  serverExternalPackages: ["swisseph-wasm"],
};

export default nextConfig;
