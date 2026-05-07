import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Phase F-10 chunk-splitting:
 *   - `flow`      → @xyflow/react (heavy graph runtime, only used on canvas)
 *   - `motion`    → framer-motion (animations)
 *   - `lottie`    → @lottiefiles/react-lottie-player (illustrations)
 *   - `vendor`    → react / react-dom (hot path, but isolated for cache reuse)
 *
 * Pairs with the static <Icon /> allowlist refactor (Q1 closeout) which
 * restores tree-shaking of lucide-react.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("node_modules/@xyflow/")) return "flow";
          if (id.includes("node_modules/framer-motion")) return "motion";
          if (id.includes("node_modules/@lottiefiles/")) return "lottie";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
});
