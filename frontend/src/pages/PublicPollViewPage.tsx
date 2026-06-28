import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicPoll } from "../lib/api";
import {
  POLL_ANSWERS,
  POLL_ANSWER_LABELS,
  POLL_ANSWER_COLORS,
  formatCandidate,
  formatDateTime,
} from "../lib/poll-format";
import type { PollAnswer, PollViewResponse } from "../lib/api-types";

interface StoredEdit {
  editKey: string;
  participantId: string;
}

function storageKey(publicId: string) {
  return `poll-edit-${publicId}`;
}

function loadStoredEdit(publicId: string): StoredEdit | null {
  try {
    const raw = localStorage.getItem(storageKey(publicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEdit;
    return parsed.editKey && parsed.participantId ? parsed : null;
  } catch {
    return null;
  }
}

export function PublicPollViewPage() {
  const { publicId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const accessToken = searchParams.get("t") || "";

  const [data, setData] = useState<PollViewResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  // 自分の回答フォーム
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [answers, setAnswers] = useState<Record<string, PollAnswer>>({});
  const [stored, setStored] = useState<StoredEdit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState("");

  const fetchData = useCallback(async () => {
    if (!accessToken) {
      setLoadError("アクセストークン (?t=...) が URL にありません");
      setLoading(false);
      return;
    }
    try {
      const res = await publicPoll.getEvent(publicId, accessToken);
      setData(res);

      // 候補ごとの回答フォーム初期値
      const st = loadStoredEdit(publicId);
      setStored(st);
      const mine = st ? res.participants.find((p) => p.id === st.participantId) : undefined;
      const init: Record<string, PollAnswer> = {};
      for (const cand of res.candidates) {
        init[cand.id] = mine?.responses[cand.id] ?? "ok";
      }
      setAnswers(init);
      if (mine) {
        setName(mine.name);
        setComment(mine.comment);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [publicId, accessToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showMsg = (msg: string) => {
    setFormMsg(msg);
    setTimeout(() => setFormMsg(""), 4000);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      showMsg("Error: お名前を入力してください");
      return;
    }
    setSubmitting(true);
    try {
      const answerList = Object.entries(answers).map(([candidateId, answer]) => ({ candidateId, answer }));
      if (stored) {
        await publicPoll.editResponse(publicId, accessToken, {
          editKey: stored.editKey,
          name: name.trim(),
          comment: comment.trim(),
          answers: answerList,
        });
        showMsg("回答を更新しました");
      } else {
        const res = await publicPoll.submitResponse(publicId, accessToken, {
          name: name.trim(),
          comment: comment.trim(),
          answers: answerList,
        });
        const newStored: StoredEdit = { editKey: res.editKey, participantId: res.participantId };
        localStorage.setItem(storageKey(publicId), JSON.stringify(newStored));
        setStored(newStored);
        showMsg("回答を送信しました");
      }
      await fetchData();
    } catch (e) {
      showMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
        <span style={{ color: "var(--text-muted)" }}>読み込み中...</span>
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
  const isOpen = event.status === "open";
  const isFinalized = event.status === "finalized";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <div className="page-header">
        <h1>{event.title}</h1>
        {event.description && <p>{event.description}</p>}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "center" }}>
          {event.creatorName && (
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>作成者: {event.creatorName}</span>
          )}
          <span className={`badge ${isOpen ? "green" : isFinalized ? "blue" : "red"}`}>
            {isOpen ? "受付中" : isFinalized ? "確定済み" : "締切"}
          </span>
          {event.deadline && (
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              回答締切: {formatDateTime(event.deadline)}
            </span>
          )}
        </div>
      </div>

      {/* ─── 確定日時の強調表示 ─── */}
      {isFinalized && (
        <div
          className="card"
          style={{ marginBottom: "1.5rem", borderColor: "var(--accent)", background: "rgba(88,166,255,0.08)" }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>確定した日時</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent)" }}>
            {event.finalizedStartTime ? formatDateTime(event.finalizedStartTime) : "—"}
            {event.finalizedEndTime && ` 〜 ${formatDateTime(event.finalizedEndTime)}`}
          </div>
        </div>
      )}

      {/* ─── 集計・回答マトリクス ─── */}
      <div className="card" style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
        <h3 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          回答状況 ({participants.length}名)
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
                          <span style={{ color: POLL_ANSWER_COLORS[ans], fontWeight: 700 }}>
                            {POLL_ANSWER_LABELS[ans]}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── 自分の回答フォーム ─── */}
      <div className="card foundation-form">
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>{stored ? "回答を編集" : "回答する"}</h3>

        {!isOpen && (
          <div className="card" style={{ marginBottom: "1rem", borderColor: "var(--orange)", color: "var(--orange)", fontSize: "0.85rem" }}>
            この日程調整は締め切られているため、回答できません。
          </div>
        )}

        {formMsg && (
          <div
            className="card"
            style={{
              marginBottom: "1rem",
              borderColor: formMsg.startsWith("Error") ? "var(--red)" : "var(--green)",
              color: formMsg.startsWith("Error") ? "var(--red)" : "var(--green)",
              fontSize: "0.85rem",
            }}
          >
            {formMsg}
          </div>
        )}

        <div className="form-group">
          <label>お名前 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOpen} placeholder="例: 山田" />
        </div>

        <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
          <table className="table">
            <thead>
              <tr>
                <th>候補</th>
                <th style={{ textAlign: "center" }}>あなたの回答</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((cand) => (
                <tr key={cand.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatCandidate(cand)}</td>
                  <td style={{ textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                      {POLL_ANSWERS.map((ans) => (
                        <button
                          key={ans}
                          type="button"
                          disabled={!isOpen}
                          onClick={() => setAnswers((prev) => ({ ...prev, [cand.id]: ans }))}
                          style={{
                            width: 36,
                            height: 30,
                            fontSize: "1rem",
                            fontWeight: 700,
                            border: answers[cand.id] === ans ? `2px solid ${POLL_ANSWER_COLORS[ans]}` : "1px solid var(--border)",
                            background: answers[cand.id] === ans ? `${POLL_ANSWER_COLORS[ans]}22` : "var(--bg-surface)",
                            color: POLL_ANSWER_COLORS[ans],
                            borderRadius: 4,
                          }}
                        >
                          {POLL_ANSWER_LABELS[ans]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-group">
          <label>コメント (任意)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} disabled={!isOpen} />
        </div>

        <button className="primary" onClick={handleSubmit} disabled={!isOpen || submitting}>
          {submitting ? "送信中..." : stored ? "回答を更新" : "回答を送信"}
        </button>
        {stored && (
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            この端末には編集キーが保存されています。再訪時に同じ回答を編集できます。
          </p>
        )}
      </div>
    </div>
  );
}
