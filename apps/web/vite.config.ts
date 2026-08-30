import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Absolute `/` is required for Netlify deep links (/auth/callback, /chat, …).
// Relative `./` breaks asset URLs on those paths (blank white page after OAuth).
// Capacitor native builds still opt into `./` via CAPACITOR_BUILD=1.
const capacitorBuild = process.env.CAPACITOR_BUILD === "1";

export default defineConfig({
  base: capacitorBuild ? "./" : "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-512.png",
        "manifest.json",
      ],
      manifest: {
        name: "ElfCom",
        short_name: "ElfCom",
        description: "Sovereign messaging — ElfChat, ElfMail, OmniChat, OmniMail",
        theme_color: "#0F172A",
        background_color: "#0F172A",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
      },
      devOptions: {
        enabled: false,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@trustid/ui-react": path.resolve(__dirname, "../../packages/trustid-ui-react/src/index.ts"),
      "@elfcom/core": path.resolve(__dirname, "../../packages/elfcom-core/src/index.ts"),
      "@elfcom/webrtc": path.resolve(__dirname, "../../packages/webrtc/src/index.ts"),
      "@elfcom/ui": path.resolve(__dirname, "../../packages/elfcom-ui/src/index.ts"),
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
