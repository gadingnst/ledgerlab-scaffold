import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  // Bundle workspace packages so the runtime image needs no workspace graph.
  external: ["ioredis"],
  noExternal: [/^@ledgerlab\//],
});
