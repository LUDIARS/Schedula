/**
 * Discord Webhook 送信ヘルパ (public-poll 用)
 *
 * 無認証の調整さん風日程調整で、作成者が登録した Discord Webhook URL へ
 * 確定通知 / リマインドを投稿する。Bot トークンは秘密の平文 DB 保管を避ける
 * ため非対応とし、Webhook URL のみを使う (RULE §7 秘密は非平文)。
 *
 * Webhook URL 自体も credential なので、外部参照には絶対に出さない (routes 側で
 * マスク)。また任意の URL を fetch するため SSRF を防ぐ目的で host を Discord の
 * 公式ドメインに限定する。
 */

/** Discord webhook の許可ホスト (SSRF 対策) */
const ALLOWED_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "ptb.discord.com",
  "canary.discord.com",
]);

/**
 * 値が Discord webhook URL として妥当か検証する。
 * https かつ host が Discord 公式 かつ パスが /api/webhooks/... であること。
 */
export function isValidDiscordWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (!ALLOWED_HOSTS.has(url.hostname)) return false;
  return /^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(url.pathname);
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

/**
 * Discord webhook へメッセージを投稿する。
 *
 * 失敗時は throw する (無言フォールバック禁止 / fail-fast)。呼び出し側で
 * try/catch して通知失敗を握りつぶさずログ・状態に反映すること。
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  message: DiscordMessage,
): Promise<void> {
  if (!isValidDiscordWebhookUrl(webhookUrl)) {
    throw new Error("invalid discord webhook url");
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`discord webhook ${res.status}: ${text.slice(0, 300)}`);
  }
}
