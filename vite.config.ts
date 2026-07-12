import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: "es2022",
  },
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: false, // main.ts 中按环境手动注册
      manifest: {
        name: "扫雷",
        short_name: "扫雷",
        description: "无猜扫雷 · 五十关十档 · 无尽",
        lang: "zh-CN",
        display: "standalone",
        background_color: "#F2EFE9",
        theme_color: "#F2EFE9",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        ...(process.env["PWA_TEST_CACHE_ID"]
          ? { cacheId: process.env["PWA_TEST_CACHE_ID"] }
          : {}),
      },
    }),
  ],
});
