import { useState } from "react";

/**
 * 読み取り専用テキスト + コピーボタン。共有 URL / トークン表示に使う。
 */
export function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("[CopyField] コピー失敗:", e);
    }
  };

  return (
    <div className="form-group">
      <label>
        {label}
        {secret && (
          <span style={{ color: "var(--red)", marginLeft: "0.4rem", fontWeight: 600 }}>
            (作成者のみ・他人に共有しないでください)
          </span>
        )}
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
        />
        <button type="button" onClick={handleCopy} style={{ flexShrink: 0 }}>
          {copied ? "コピー済" : "コピー"}
        </button>
      </div>
    </div>
  );
}
