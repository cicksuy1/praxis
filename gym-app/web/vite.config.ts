import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Root is this web/ dir (invoked as `vite web`). Dev server proxies the API and
// SSE stream to the Bun server on :4600; production builds to web/dist, which the
// Bun server serves directly.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4600",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
