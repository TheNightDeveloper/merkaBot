import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: currentDir,
  plugins: [react()],
  build: {
    outDir: path.resolve(currentDir, "../dist/web"),
    emptyOutDir: false
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
