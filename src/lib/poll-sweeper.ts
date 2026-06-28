/**
 * Public Poll の定期スイーパー
 *
 * 専用ジョブスケジューラ (cron / BullMQ) が無いため、in-process の
 * setInterval で「締切超過の自動確定」と「開催前リマインド送信」を回す。
 * 処理は全て DB を根拠にするので、プロセス再起動後も pending な確定 /
 * リマインドは次の tick で再評価される (再起動耐性 / 冪等)。
 *
 * テスト環境 (NODE_ENV=test / VITEST) では起動しない (タイマーが
 * テストプロセスを終了させない / 外部 fetch を誘発するのを避ける)。
 */

import { secretManager } from "../config/secrets.js";
import { autoFinalizeDuePolls, sendDueReminders } from "./poll-service.js";

const TICK_MS = 60_000; // 1 分ごと

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return; // 前回の tick が長引いた場合の多重実行防止
  running = true;
  try {
    await autoFinalizeDuePolls();
    await sendDueReminders();
  } catch (err) {
    console.error("[public-poll] sweeper tick エラー:", err);
  } finally {
    running = false;
  }
}

function isTestEnv(): boolean {
  return (
    secretManager.getOrDefault("NODE_ENV", "") === "test" ||
    (typeof process !== "undefined" && process.env.VITEST === "true")
  );
}

/** スイーパーを開始する (多重起動はしない)。テスト環境では no-op。 */
export function startPollSweeper(): void {
  if (timer || isTestEnv()) return;
  // 起動直後に 1 回走らせて、ダウンタイム中に過ぎた締切/リマインドを拾う
  void tick();
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  // プロセス終了を妨げない
  if (typeof timer.unref === "function") timer.unref();
  console.log("[public-poll] sweeper started (interval=60s)");
}

/** スイーパーを停止する (主にテスト用)。 */
export function stopPollSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
