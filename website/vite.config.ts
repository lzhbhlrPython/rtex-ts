import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.PAGES_BASE_PATH || "/",
  build: {
    outDir: "dist",
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          warning.message.includes("use client")
        )
          return;
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("react-markdown") ||
              id.includes("remark-") ||
              id.includes("micromark") ||
              id.includes("mdast") ||
              id.includes("hast") ||
              id.includes("unified")
            )
              return "markdown";
            if (
              id.includes("antd") ||
              id.includes("@ant-design") ||
              id.includes("@rc-component") ||
              id.includes("rc-")
            )
              return "antd";
            return "vendor";
          }
        },
      },
    },
  },
  server: { fs: { allow: [".."] } },
});
