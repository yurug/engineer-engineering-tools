// Vite config -- builds the SPA that packages/server/src/static-web.ts
// serves at the origin `serve` prints. No dev-server proxy is configured:
// step 1's workflow is `vite build` then `backbrief serve` serves the
// result directly (architecture/overview.md's browser entry point IS the
// backbrief server's own origin, token and all -- a separate dev-server
// origin would need its own CORS/token story this step doesn't need yet).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    commonjsOptions: {
      // `@brief/shared` is a symlinked workspace package compiled to
      // CommonJS (server/cli need real `require()` semantics -- see
      // tsconfig.base.json's header). Rollup's default CJS->ESM interop
      // (used for production `vite build`, unlike the esbuild-based dev
      // pre-bundler) fails to see named exports on a *linked* package the
      // same way it does for a normal node_modules dependency; explicitly
      // listing it here is Vite's documented workaround.
      include: [/shared/, /node_modules/],
    },
  },
  optimizeDeps: {
    // The browser-safe subpath (packages/shared/src/index.browser.ts) --
    // NOT the default "." entry, which pulls in node:crypto (see that
    // file's header for the warning this avoids).
    include: ["@backbrief/shared/browser"],
  },
});
