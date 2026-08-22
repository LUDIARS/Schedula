import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    // beforeAll が src/app.ts (SDK モジュール 6 本を含む) を動的 import する。
    // 冷えたモジュールグラフでは既定の 10s を超えるため testTimeout に合わせる。
    hookTimeout: 15000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
