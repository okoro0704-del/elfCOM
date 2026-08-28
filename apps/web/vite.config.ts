import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  // Relative assets so Capacitor Android/iOS WebViews load the bundle correctly.
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "ElfCom",
        short_name: "ElfCom",
        description: "Sovereign messaging — ElfChat, ElfMail, OmniChat, OmniMail",
        theme_color: "#0b3d3a",
        background_color: "#071f1e",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5180,
    proxy: {
      "/v1": { target: "http://localhost:8791", changeOrigin: true, ws: true },
      "/health": { target: "http://localhost:8791", changeOrigin: true },
    },
  },
});
