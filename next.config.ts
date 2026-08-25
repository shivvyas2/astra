import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // swisseph-wasm ships a .wasm binary; keep it external so Next bundles it for the server runtime.
  serverExternalPackages: ["swisseph-wasm"],

  async headers() {
    return [
      {
        // Apple requires the association file to be served as JSON, and the
        // filename must have no extension — so Next serves it as
        // application/octet-stream unless told otherwise.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "content-type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
