import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node22",
  dts: false,  // Skip type generation (SDK subpaths not available locally)
  external: [/^openclaw/],  // Mark all openclaw/* imports as external
});
