import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5191,
    proxy: {
      "/v1": { target: "http://localhost:8791", changeOrigin: true, ws: true },
      "/health": { target: "http://localhost:8791", changeOrigin: true },
    },
  },
});
