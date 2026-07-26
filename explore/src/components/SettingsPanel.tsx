"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SettingsView {
  anthropicApiKey: string | null; // 掩码
  voyageApiKey: string | null; // 掩码
  dailyCardLimit: number;
  maxConcurrent: number;
}

export function SettingsPanel({ initialOpen }: { initialOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [current, setCurrent] = useState<SettingsView | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [voyageKey, setVoyageKey] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: SettingsView) => {
        setCurrent(s);
        setDailyLimit(String(s.dailyCardLimit));
      })
      .catch(() => {});
  }, [open]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (anthropicKey.trim()) body.anthropicApiKey = anthropicKey.trim();
      if (voyageKey.trim()) body.voyageApiKey = voyageKey.trim();
      const n = Number(dailyLimit);
      if (n > 0 && n !== current?.dailyCardLimit) body.dailyCardLimit = n;

      if (Object.keys(body).length === 0) {
        setMsg({ kind: "err", text: "没有需要保存的修改" });
        return;
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: (data as { error?: string }).error ?? "保存失败" });
        return;
      }
      setCurrent(data as SettingsView);
      setAnthropicKey("");
      setVoyageKey("");
      setMsg({ kind: "ok", text: "已保存,即时生效 ✓" });
      router.refresh(); // 刷新首页横幅/看板
    } catch {
      setMsg({ kind: "err", text: "网络错误" });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 输入框有新 Key 就测新的,否则测已保存的
        body: JSON.stringify(anthropicKey.trim() ? { key: anthropicKey.trim() } : {}),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setMsg(
        data.ok
          ? { kind: "ok", text: "连接成功,Key 可用 ✓" }
          : { kind: "err", text: `连接失败:${data.error}` },
      );
    } catch {
      setMsg({ kind: "err", text: "网络错误" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings">
      <button className="settings-toggle" onClick={() => setOpen(!open)}>
        ⚙️ 设置 {open ? "▴" : "▾"}
      </button>

      {open && (
        <div className="settings-body">
          <label className="settings-field">
            <span>
              Anthropic API Key <em>(必填,驱动卡片生成)</em>
              {current?.anthropicApiKey && (
                <em className="settings-current">当前:{current.anthropicApiKey}</em>
              )}
            </span>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder={current?.anthropicApiKey ? "输入新 Key 以替换" : "sk-ant-…"}
              autoComplete="off"
            />
          </label>

          <label className="settings-field">
            <span>
              Voyage API Key <em>(可选,启用语义连线与锚点教学)</em>
              {current?.voyageApiKey && (
                <em className="settings-current">当前:{current.voyageApiKey}</em>
              )}
            </span>
            <input
              type="password"
              value={voyageKey}
              onChange={(e) => setVoyageKey(e.target.value)}
              placeholder={current?.voyageApiKey ? "输入新 Key 以替换" : "pa-…(留空跳过)"}
              autoComplete="off"
            />
          </label>

          <label className="settings-field narrow">
            <span>每日卡片上限</span>
            <input
              type="number"
              min={1}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
          </label>

          <div className="settings-actions">
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? "处理中…" : "保存"}
            </button>
            <button className="settings-test" onClick={test} disabled={busy}>
              测试连接
            </button>
            {msg && (
              <span className={`settings-msg ${msg.kind}`}>{msg.text}</span>
            )}
          </div>
          <p className="settings-note">
            Key 保存在本机 <code>settings.local.json</code>(已加入
            .gitignore),只回传掩码,不经过任何第三方。
          </p>
        </div>
      )}
    </div>
  );
}
