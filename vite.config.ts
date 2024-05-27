import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";

/// <reference types="vitest" />
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    build: {
      outDir: "build",
    },
    plugins: [
      react(),
      tsconfigPaths(),
      createHtmlPlugin({
        inject: {
          data: {
            injectScript:
              process.env.NODE_ENV === "development"
                ? '<script src="/config.local.js"></script>'
                : "",
          },
        },
      }),
      nodePolyfills({
        // Whether to polyfill specific globals.
        globals: {
          // Required by bakeryjs and async-limiter.
          process: true,
        },
      }),
    ],
    server: {
      host: "0.0.0.0",
      port: Number(env.PORT),
      // On parent machine:
      //   ssh -L :8082:192.168.64.56:8082 -L :17070:192.168.64.56:17070  -L :443:192.168.64.56:443 -L :8036:192.168.64.56:8036 ubuntu@192.168.64.56
      proxy: {
        ["/auth"]: {
          //   hostRewrite: "jimm.localhost:17070",
          //   protocolRewrite: true,
          changeOrigin: true,
          autoRewrite: true,
          secure: false,
          //   cookieDomainRewrite: {
          //     //   "jimm.localhost:17070": "dev.local:8036",
          //     "*": "dev.local:8036",
          //   },
          target: "http://jimm.localhost:17070/",
        },
      },
    },
    test: {
      coverage: {
        reporter: ["text", "json-summary", "json", "cobertura"],
        reportOnFailure: true,
      },
      environment: "happy-dom",
      globals: true,
      include: [
        "src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
        "demo/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      ],
      mockReset: true,
      setupFiles: "src/testing/setup.ts",
    },
  };
});
