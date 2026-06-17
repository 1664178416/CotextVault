import { build as viteBuild } from "vite";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const distRoot = resolve(appRoot, "dist");

async function bundle({ entry, outDir, fileName, format, name }) {
  await viteBuild({
    root: appRoot,
    configFile: false,
    publicDir: false,
    build: {
      emptyOutDir: false,
      outDir,
      sourcemap: true,
      codeSplitting: false,
      lib: {
        entry,
        formats: [format],
        name,
        fileName: () => fileName
      }
    }
  });
}

await bundle({
  entry: resolve(appRoot, "src/background/service-worker.ts"),
  outDir: resolve(distRoot, "background"),
  fileName: "service-worker.js",
  format: "es"
});

await bundle({
  entry: resolve(appRoot, "src/content/content-script.ts"),
  outDir: resolve(distRoot, "content"),
  fileName: "content-script.js",
  format: "iife",
  name: "ContextVaultContentScript"
});

await bundle({
  entry: resolve(appRoot, "src/main-world/interceptor.ts"),
  outDir: resolve(distRoot, "main-world"),
  fileName: "interceptor.js",
  format: "iife",
  name: "ContextVaultMainWorld"
});

console.log(`Extension bundles written to ${distRoot}`);
