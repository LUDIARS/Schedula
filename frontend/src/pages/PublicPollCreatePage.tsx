import { useState } from "react";
import { publicPoll } from "../lib/api";
import { localInputToIso, parseReminderOffsets } from "../lib/poll-format";
import type { PollCandidateInput, PollCreateResponse } from "../lib/api-types";
import { CopyField } from "../components/CopyField";

// ─── Types ──────────────────────────────────────────────────

interface CandidateRow {
  startTime: string; // datetime-local
  endTime: string; // datetime-local (任意)
  label: string;
}

const emptyCandidate = (): CandidateRow => ({ startTime: "", endTime: "", label: "" });

// ─── Component ──────────────────────────────────────────────

export function PublicPollCreatePage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [candidates, setCandidates] = useState<CandidateRow[]>([emptyCandidate()]);
  const [deadline, setDeadline] = useState("");
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [reminderText, setReminderText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [calendarOwnerId, setCalendarOwnerId] = useState("");
  const [calendarGroupId, setCalendarGroupId] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<PollCreateResponse | null>(null);

  const updateCandidate = (i: number, patch: Partial<CandidateRow>) => {
    setCandidates((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const addCandidate = () => setCandidates((prev) => [...prev, emptyCandidate()]);
  const removeCandidate = (i: number) =>
    setCandidates((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleSubmit = async () => {
    setError("");
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    const rows: PollCandidateInput[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c.startTime) continue; // 空行はスキップ
      const startIso = localInputToIso(c.startTime);
      if (!startIso) {
        setError(`候補 ${i + 1} の開始日時が不正です`);
        return;
      }
      const endIso = c.endTime ? localInputToIso(c.endTime) : null;
      if (c.endTime && !endIso) {
        setError(`候補 ${i + 1} の終了日時が不正です`);
        return;
      }
      rows.push({ startTime: startIso, endTime: endIso, label: c.label.trim() || undefined });
    }
    if (rows.length === 0) {
      setError("候補日時を 1 件以上入力してください");
      return;
    }

    setLoading(true);
    try {
      const res = await publicPoll.createEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        creatorName: creatorName.trim() || undefined,
        candidates: rows,
        deadline: deadline ? localInputToIso(deadline) : null,
        autoFinalize,
        discordWebhookUrl: discordWebhookUrl.trim() || null,
        reminderOffsets: reminderText.trim() ? parseReminderOffsets(reminderText) : undefined,
        calendarOwnerId: calendarOwnerId.trim() || null,
        calendarGroupId: calendarGroupId.trim() || null,
      });
      setCreated(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  // ─── 作成完了画面 ──────────────────────────────────────────

  if (created) {
    const origin = window.location.origin;
    const shareUrl = `${origin}/p/${created.publicId}?t=${created.accessToken}`;
    const adminUrl = `${origin}/p/${created.publicId}/admin?k=${created.adminToken}`;
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
        <div className="page-header">
          <h1>日程調整を作成しました</h1>
          <p>下記の URL を参加者に共有してください。</p>
        </div>
        <div className="card foundation-form" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <CopyField label="参加者用 共有 URL (回答ページ)" value={shareUrl} />
          <CopyField label="管理用 URL (確定・設定変更)" value={adminUrl} secret />
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            管理用 URL に含まれる管理トークン (adminToken) は<strong>作成者しか見られません</strong>。
            このページを離れると再表示できないため、必ずブックマークするかコピーして保管してください。
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <a href={shareUrl} className="primary" style={{ padding: "0.5rem 1rem", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#000", fontWeight: 600 }}>
              回答ページを開く
            </a>
            <a href={adminUrl} style={{ padding: "0.5rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              管理ページを開く
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── 作成フォーム ──────────────────────────────────────────

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <div className="page-header">
        <h1>日程調整を作成</h1>
        <p>ログイン不要。候補日時を並べて、参加者に URL を共有するだけ。</p>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: "1rem", borderColor: "var(--red)", color: "var(--red)", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      <div className="card foundation-form" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div className="form-group">
          <label>タイトル *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 新年会の日程" />
        </div>
        <div className="form-group">
          <label>説明 (任意)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="補足事項など" />
        </div>
        <div className="form-group">
          <label>あなたのお名前 (任意・作成者名)</label>
          <input value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder="例: 田中" />
        </div>

        {/* ─── 候補日時 ─── */}
        <div className="form-group">
          <label>候補日時 *</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {candidates.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr auto",
                  gap: "0.4rem",
                  alignItems: "center",
                }}
              >
                <input
                  type="datetime-local"
                  value={c.startTime}
                  onChange={(e) => updateCandidate(i, { startTime: e.target.value })}
                  title="開始日時 (必須)"
                />
                <input
                  type="datetime-local"
                  value={c.endTime}
                  onChange={(e) => updateCandidate(i, { endTime: e.target.value })}
                  title="終了日時 (任意)"
                />
                <input
                  value={c.label}
                  onChange={(e) => updateCandidate(i, { label: e.target.value })}
                  placeholder="ラベル (任意)"
                />
                <button
                  type="button"
                  className="danger"
                  onClick={() => removeCandidate(i)}
                  disabled={candidates.length <= 1}
                  style={{ padding: "0.4rem 0.6rem" }}
                  title="この候補を削除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addCandidate} style={{ marginTop: "0.5rem" }}>
            ＋ 候補を追加
          </button>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            開始日時は必須。終了日時とラベルは任意です。
          </p>
        </div>

        <div className="form-group">
          <label>回答締切 (任意)</label>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>

        <div className="form-group">
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoFinalize}
              onChange={(e) => setAutoFinalize(e.target.checked)}
              style={{ width: "auto" }}
            />
            締切時に最も評価の高い候補で自動確定する
          </label>
        </div>

        <div className="form-group">
          <label>Discord Webhook URL (任意・確定時に通知)</label>
          <input
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
          />
        </div>

        <div className="form-group">
          <label>開催前リマインドの分前 (任意・カンマ区切り)</label>
          <input value={reminderText} onChange={(e) => setReminderText(e.target.value)} placeholder="例: 1440, 60" />
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            例: 「1440, 60」で前日 (1440分前) と 1時間前 (60分前) に Discord へ通知。
          </p>
        </div>

        {/* ─── 上級者向け (折りたたみ) ─── */}
        <div>
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} style={{ fontSize: "0.8rem" }}>
            {showAdvanced ? "▼ カレンダー連携 (上級者向け)" : "▶ カレンダー連携 (上級者向け)"}
          </button>
          {showAdvanced && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div className="form-group">
                <label>calendarOwnerId (任意)</label>
                <input
                  value={calendarOwnerId}
                  onChange={(e) => setCalendarOwnerId(e.target.value)}
                  placeholder="確定予定をコア events に登録するユーザ ID"
                />
              </div>
              <div className="form-group">
                <label>calendarGroupId (任意)</label>
                <input value={calendarGroupId} onChange={(e) => setCalendarGroupId(e.target.value)} placeholder="グループ ID" />
              </div>
            </div>
          )}
        </div>

        <button className="primary" onClick={handleSubmit} disabled={loading} style={{ marginTop: "0.5rem" }}>
          {loading ? "作成中..." : "日程調整を作成"}
        </button>
      </div>
    </div>
  );
}
