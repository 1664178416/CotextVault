import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: "sidepanel.html"
      },
      output: {
        entryFileNames: "sidepanel/assets/[name].js",
        chunkFileNames: "sidepanel/assets/[name].js",
        assetFileNames: "sidepanel/assets/[name][extname]"
      }
    }
  }
});

