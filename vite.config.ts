import path from "node:path";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

// The backend serves the API and the delivery route; in development the dev
// server forwards the API so the browser sees one origin.
export default defineConfig({
  fmt: {},
  lint: {
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  plugins: lazyPlugins(() => [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()]),
  build: {
    rolldownOptions: {
      onwarn(warning) {
        // The bundler's timing advisory is exempt, as vite-plus's own
        // `failOnWarn` exempts it: it reports how the build spent its time
        // rather than what it produced, and it fires on any machine whose
        // compiler plugin is a large share of a short build. Every other
        // warning is still fatal.
        if (warning.code === "PLUGIN_TIMINGS") return;
        throw new Error(warning.message);
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8090",
    },
  },
});
