// Vite config -- builds the SPA that @inbrief/server serves at the origin
// `inbrief serve` prints.
//
// No dev-server proxy, deliberately: the workflow is `vite build` then serve
// dist/ from the server's own origin, because the browser's entry point IS that
// origin, human token and all. A proxied dev server would need a second way to
// get the token in, and that second way is what would rot.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
