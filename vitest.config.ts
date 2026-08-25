import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: { environment: "node", include: ["**/*.test.ts"] },
  resolve: {
    alias: {
      "@": root("./"),
      // Route handlers and lib/env.ts import "server-only", whose default entry
      // throws outside a React Server Component. Next resolves it via the
      // "react-server" export condition to an empty no-op; vitest does not, so
      // point at that same no-op explicitly to make server modules testable.
      "server-only": root("./node_modules/server-only/empty.js"),
    },
  },
});
