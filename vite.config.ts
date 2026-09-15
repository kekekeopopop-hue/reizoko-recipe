import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const base = "/reizoko-recipe/";

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "冷蔵庫レシピ",
        short_name: "レシピ",
        description: "手持ちの食材からレシピを提案",
        lang: "ja",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#fffaf3",
        theme_color: "#fffaf3",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        // LLM API へのリクエストは絶対にキャッシュしない
        navigateFallback: "index.html",
        runtimeCaching: [],
      },
    }),
  ],
});
