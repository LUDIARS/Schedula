/**
 * Public Poll (調整さん風 無認証日程調整) の表示ヘルパー。
 *
 * 回答ラベル/色、候補日時の整形、datetime-local <-> ISO の変換を集約する。
 * JSX を含まない純ロジックのみ (react-refresh の component-export 制約回避)。
 */

import type { PollAnswer, PollCandidateView } from "./api-types";

export const POLL_ANSWERS: PollAnswer[] = ["ok", "maybe", "ng"];

export const POLL_ANSWER_LABELS: Record<PollAnswer, string> = {
  ok: "○", // ○
  maybe: "△", // △
  ng: "×", // ×
};

export const POLL_ANSWER_COLORS: Record<PollAnswer, string> = {
  ok: "#3FB950",
  maybe: "#D29922",
  ng: "#F85149",
};

/** 候補の表示文字列。label があれば優先、無ければ開始(〜終了)日時を整形。 */
export function formatCandidate(c: PollCandidateView): string {
  if (c.label) return c.label;
  const start = new Date(c.startTime);
  if (isNaN(start.getTime())) return c.label || "(不明な日時)";
  const startFmt = start.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (c.endTime) {
    const end = new Date(c.endTime);
    if (!isNaN(end.getTime())) {
      const endFmt = end.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      return `${startFmt}〜${endFmt}`;
    }
  }
  return startFmt;
}

/** ISO 文字列を人間可読なローカル日時へ。null/不正は空文字。 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP");
}

/** ISO 文字列を datetime-local 入力値 (YYYY-MM-DDTHH:mm, ローカルtz) へ。 */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 入力値 (ローカルtz) を ISO 文字列へ。空/不正は null。 */
export function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** "60, 1440" のようなカンマ区切り文字列を分数の配列へ。 */
export function parseReminderOffsets(text: string): number[] {
  return text
    .split(/[,、\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n));
}
