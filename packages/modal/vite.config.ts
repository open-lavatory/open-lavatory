import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    solid(),
    tailwindcss(),
    dts({
      outDir: "dist",
      entryRoot: "src",
      rollupTypes: true,
      bundledPackages: ["solid-js", "csstype"],
    }),
  ],
  build: {
    lib: {
      name: "OpenLVModal",
      entry: {
        index: "src/index.ts",
      },
      formats: ["es", "cjs"],
      fileName: (format, entry) => `${entry}.${format}.js`,
    },
    sourcemap: true,
    target: "es2020",
    cssCodeSplit: false,
    rollupOptions: {},
  },
});
