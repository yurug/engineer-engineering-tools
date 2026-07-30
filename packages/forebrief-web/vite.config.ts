// Vite config -- builds the SPA that @forebrief/server's `mountStaticWeb`
// wiring (server.ts) serves at the origin `forebrief serve` prints.
//
// No dev-server proxy: the workflow is `vite build` then `forebrief serve`
// serves `dist/` directly at its own origin (mirrors backbrief's own
// packages/web/vite.config.ts -- the browser's entry point IS the server's
// origin, token and all). Unlike backbrief's web package, this one depends
// on NEITHER `@brief/core` NOR `@brief/shared` -- every wire type
// the browser needs is a plain local TS interface (src/lib/types.ts), so
// there is no linked-workspace-package CJS/ESM interop to work around here.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
