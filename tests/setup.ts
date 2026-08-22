/**
 * Test setup: SQLite in-memory DB initialization
 *
 * テスト用の環境変数を設定し、各テーブルを初期化する
 */

import { mkdirSync } from "fs";
import { resolve } from "path";

// テスト用DBパスを設定（各テスト実行ごとにユニーク）
const testDbPath = resolve("data", `test-${process.pid}.db`);
mkdirSync(resolve("data"), { recursive: true });

// 実行環境が NODE_ENV=production を export していてもテストは test 環境として
// 走らせる。production では userContext() の X-User-Id フォールバックと
// admin role の JWT フォールバックが無効化され (fail-closed)、テストが
// 認証できなくなるため。
process.env.NODE_ENV = "test";

process.env.DATABASE_PATH = testDbPath;
process.env.DB_DIALECT = "sqlite";
process.env.JWT_SECRET = "test-secret-key-for-testing";
process.env.REDIS_URL = ""; // Redis無効化

import { afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";

afterAll(() => {
  // テスト用DBファイルを削除
  try {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + "-wal")) unlinkSync(testDbPath + "-wal");
    if (existsSync(testDbPath + "-shm")) unlinkSync(testDbPath + "-shm");
  } catch {
    // ignore
  }
});
