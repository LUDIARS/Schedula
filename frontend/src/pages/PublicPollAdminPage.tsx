import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicPoll } from "../lib/api";
import {
  POLL_ANSWER_LABELS,
  POLL_ANSWER_COLORS,
  formatCandidate,
  formatDateTime,
  isoToLocalInput,
  localInputToIso,
  parseReminderOffsets,
} from "../lib/poll-format";
import type { PollAdminResponse, PollFinalizeResponse } from "../lib/api-types";
import { CopyField } from "../components/CopyField";

export function PublicPollAdminPage() {
  const { publicId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const adminToken = searchParams.get("k") || "";

  const [data, setData] = useState<PollAdminResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [finalizeResult, setFinalizeResult] = useState<PollFinalizeResponse | null>(null);
  const [deleted, setDeleted] = useState(false);

  // 設定編集フォーム
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [reminderText, setReminderText] = useState("");

  const showMsg = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 4000);
  };

  const fetchData = useCallback(async () => {
    if (!adminToken) {
      setLoadError("管理トークン (?k=...) が URL にありません");
      setLoading(false);
      return;
    }
    try {
      const res = await publicPoll.getAdmin(publicId, adminToken);
      setData(res);
      setTitle(res.event.title);
      setDescription(res.event.description);
      setDeadline(isoToLocalInput(res.event.deadline));
      setAutoFinalize(res.event.autoFinalize);
      setReminderText((res.event.reminderOffsets ?? []).join(", "));
      // webhook はマスク済しか返らないため、編集欄は空 (空送信時は変更しない)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [publicId, adminToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFinalize = async (candidateId: string) => {
    setBusy(true);
    try {
      const res = await publicPoll.finalize(publicId, adminToken, candidateId);
      setFinalizeResult(res);
      showMsg("日程を確定しました");
      await fetchData();
    } catch (e) {
      showMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  const handleReopen = async () => {
    setBusy(true);
    try {
      await publicPoll.reopen(publicId, adminToken);
      setFinalizeResult(null);
      showMsg("受付を再開しました");
      await fetchData();
    } catch (e) {
      showMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  const handleSaveSettings = async () => {
    setBusy(true);
    try {
      await publicPoll.updateSettings(publicId, adminToken, {
        title: title.trim() || undefined,
        description,
        deadline: deadline ? localInputToIso(deadline) : null,
        autoFinalize,
        // 入力があったときだけ webhook を更新 (空は無変更扱い)
        ...(discordWebhookUrl.trim() ? { discordWebhookUrl: discordWebhookUrl.trim() } : {}),
        reminderOffsets: parseReminderOffsets(reminderText),
      });
      setDiscordWebhookUrl("");
      showMsg("設定を保存しました");
      await fetchData();
    } catch (e) {
      showMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  const handleClearWebhook = async () => {
    setBusy(true);
    try {
      await publicPoll.updateSettings(publicId, adminToken, { discordWebhookUrl: null });
      setDiscordWebhookUrl("");
      showMsg("Discord 通知設定を解除しました");
      await fetchData();
    } catch (e) {
      showMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("この日程調整を完全に削除します。よろしいですか?")) return;
    setBusy(true);
    try {
      await publicPoll.deleteEvent(publicId, adminToken);
      setDeleted(true);
    } catch (e) {
      showMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
        <span style={{ color: "var(--text-muted)" }}>読み込み中...</span>
      </div>
    );
  }

  if (deleted) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
        <div className="card">この日程調整は削除されました。</div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
        <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)" }}>
          {loadError || "データを取得できませんでした"}
        </div>
      </div>
    );
  }

  const { event, candidates, participants, tally } = data;
  const tallyMap = new Map(tally.map((t) => [t.candidateId, t]));
  const isFinalized = event.status === "finalized";
  const shareUrl = `${window.location.origin}/p/${event.publicId}?t=${event.accessToken}`;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <div className="page-header">
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <h1>{event.title}</h1>
          <span className={`badge ${event.status === "open" ? "green" : isFinalized ? "blue" : "red"}`}>
            {event.status === "open" ? "受付中" : isFinalized ? "確定済み" : "締切"}
          </span>
        </div>
        <p>管理ビュー — 日程の確定・設定変更ができます。</p>
      </div>

      {msg && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: msg.startsWith("Error") ? "var(--red)" : "var(--green)",
            color: msg.startsWith("Error") ? "var(--red)" : "var(--green)",
            fontSize: "0.85rem",
          }}
        >
          {msg}
        </div>
      )}

      {/* ─── 共有 URL ─── */}
      <div className="card foundation-form" style={{ marginBottom: "1.5rem" }}>
        <CopyField label="参加者用 共有 URL (回答ページ)" value={shareUrl} />
      </div>

      {/* ─── 確定状態 ─── */}
      {isFinalized && (
        <div className="card" style={{ marginBottom: "1.5rem", borderColor: "var(--accent)", background: "rgba(88,166,255,0.08)" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>確定した日時</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent)" }}>
            {event.finalizedStartTime ? formatDateTime(event.finalizedStartTime) : "—"}
            {event.finalizedEndTime && ` 〜 ${formatDateTime(event.finalizedEndTime)}`}
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {finalizeResult && (
              <span>Discord 送信: {finalizeResult.discordSent ? "成功" : "なし/失敗"}</span>
            )}
            <span>calendarEventId: {event.calendarEventId || "(未連携)"}</span>
          </div>
          <button onClick={handleReopen} disabled={busy} style={{ marginTop: "0.75rem" }}>
            受付を再開する
          </button>
        </div>
      )}

      {/* ─── 集計・確定操作 ─── */}
      <div className="card" style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
        <h3 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          集計 ({participants.length}名)
        </h3>
        <table className="table">
          <thead>
            <tr>
              <th>候補</th>
              <th style={{ textAlign: "center", color: POLL_ANSWER_COLORS.ok }}>{POLL_ANSWER_LABELS.ok}</th>
              <th style={{ textAlign: "center", color: POLL_ANSWER_COLORS.maybe }}>{POLL_ANSWER_LABELS.maybe}</th>
              <th style={{ textAlign: "center", color: POLL_ANSWER_COLORS.ng }}>{POLL_ANSWER_LABELS.ng}</th>
              <th style={{ textAlign: "center" }}>スコア</th>
              {participants.map((p) => (
                <th key={p.id} style={{ textAlign: "center", fontSize: "0.75rem" }} title={p.comment}>
                  {p.name}
                </th>
              ))}
              {!isFinalized && <th style={{ textAlign: "center" }}>確定</th>}
            </tr>
          </thead>
          <tbody>
            {candidates.map((cand) => {
              const t = tallyMap.get(cand.id);
              const isFinal = event.finalizedCandidateId === cand.id;
              return (
                <tr key={cand.id} style={isFinal ? { background: "rgba(88,166,255,0.12)" } : undefined}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    {isFinal && <span style={{ color: "var(--accent)", marginRight: "0.3rem" }}>★</span>}
                    {formatCandidate(cand)}
                  </td>
                  <td style={{ textAlign: "center", color: POLL_ANSWER_COLORS.ok }}>{t?.ok ?? 0}</td>
                  <td style={{ textAlign: "center", color: POLL_ANSWER_COLORS.maybe }}>{t?.maybe ?? 0}</td>
                  <td style={{ textAlign: "center", color: POLL_ANSWER_COLORS.ng }}>{t?.ng ?? 0}</td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{t?.score ?? 0}</td>
                  {participants.map((p) => {
                    const ans = p.responses[cand.id];
                    return (
                      <td key={p.id} style={{ textAlign: "center" }}>
                        {ans ? (
                          <span style={{ color: POLL_ANSWER_COLORS[ans], fontWeight: 700 }}>{POLL_ANSWER_LABELS[ans]}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>-</span>
                        )}
                      </td>
                    );
                  })}
                  {!isFinalized && (
                    <td style={{ textAlign: "center" }}>
                      <button className="primary" disabled={busy} onClick={() => handleFinalize(cand.id)} style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}>
                        この日に確定
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── 設定編集 ─── */}
      <div className="card foundation-form" style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <h3 style={{ fontSize: "0.95rem" }}>設定</h3>
        <div className="form-group">
          <label>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-group">
          <label>説明</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="form-group">
          <label>回答締切</label>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="form-group">
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input type="checkbox" checked={autoFinalize} onChange={(e) => setAutoFinalize(e.target.checked)} style={{ width: "auto" }} />
            締切時に自動確定する
          </label>
        </div>
        <div className="form-group">
          <label>Discord Webhook URL</label>
          <input
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            placeholder={event.discordWebhookMasked || "https://discord.com/api/webhooks/... (変更時のみ入力)"}
          />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.4rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              現在: {event.discordWebhookMasked || "未設定"}
            </span>
            {event.discordConfigured && (
              <button type="button" className="danger" onClick={handleClearWebhook} disabled={busy} style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}>
                解除
              </button>
            )}
          </div>
        </div>
        <div className="form-group">
          <label>開催前リマインドの分前 (カンマ区切り)</label>
          <input value={reminderText} onChange={(e) => setReminderText(e.target.value)} placeholder="例: 1440, 60" />
        </div>
        <button className="primary" onClick={handleSaveSettings} disabled={busy}>
          {busy ? "保存中..." : "設定を保存"}
        </button>
      </div>

      {/* ─── 削除 ─── */}
      <div className="card" style={{ borderColor: "var(--red)" }}>
        <h3 style={{ fontSize: "0.95rem", color: "var(--red)", marginBottom: "0.5rem" }}>危険な操作</h3>
        <button className="danger" onClick={handleDelete} disabled={busy}>
          この日程調整を削除する
        </button>
      </div>
    </div>
  );
}
