"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProviderKind, ProviderSettings } from "@/lib/settings";

type Mode = "text" | "vision";
type View = {
  activeProvider: ProviderKind;
  providers: Record<ProviderKind, ProviderSettings>;
  vision: { activeProvider: ProviderKind; providers: Record<ProviderKind, ProviderSettings> };
  hasApiKey: Record<ProviderKind, boolean>;
  hasVisionApiKey: Record<ProviderKind, boolean>;
  dailyCardLimit: number;
  maxConcurrent: number;
};

const LABELS: Record<ProviderKind, string> = {
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
  "openai-compatible": "自定义 OpenAI 兼容",
};

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [mode, setMode] = useState<Mode>("text");
  const [kind, setKind] = useState<ProviderKind>("deepseek");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [daily, setDaily] = useState("50");
  const [concurrent, setConcurrent] = useState("3");
  const [busy, setBusy] = useState(false);
  const [allowForce, setAllowForce] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const keyExists = useMemo(
    () => mode === "vision" ? Boolean(view?.hasVisionApiKey[kind]) : Boolean(view?.hasApiKey[kind]),
    [kind, mode, view],
  );

  const load = useCallback(async () => {
    const response = await fetch("/api/settings", { cache: "no-store" });
    const data = await response.json() as View;
    setView(data);
    setDaily(String(data.dailyCardLimit));
    setConcurrent(String(data.maxConcurrent));
    if (!data.hasApiKey[data.activeProvider]) setOpen(true);
  }, []);

  useEffect(() => { load().catch(() => setMessage({ ok: false, text: "无法读取设置" })); }, [load]);
  useEffect(() => {
    if (!view) return;
    const selectedKind = mode === "vision" ? view.vision.activeProvider : view.activeProvider;
    setKind(selectedKind);
  }, [mode, view]);
  useEffect(() => {
    if (!view) return;
    const provider = (mode === "vision" ? view.vision.providers : view.providers)[kind];
    setBaseUrl(provider.baseUrl);
    setModel(provider.model);
    setModels([]);
    setApiKey("");
    setMessage(null);
    setAllowForce(false);
  }, [kind, mode, view]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function persist(close = true) {
    const provider = { kind, baseUrl: baseUrl.trim(), model: model.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) };
    const body = mode === "vision"
      ? { vision: { activeProvider: kind, provider } }
      : { activeProvider: kind, provider, dailyCardLimit: Number(daily), maxConcurrent: Number(concurrent) };
    const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "保存失败");
    await load();
    setApiKey("");
    if (close) setOpen(false);
  }

  async function saveAndTest() {
    if (busy) return;
    if (!baseUrl.trim() || !model.trim()) {
      setMessage({ ok: false, text: "请填写 API 地址和模型" });
      return;
    }
    setBusy(true);
    setMessage(null);
    setAllowForce(false);
    try {
      const response = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, baseUrl: baseUrl.trim(), model: model.trim(), scope: mode, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }),
      });
      const data = await response.json() as { ok: boolean; models?: string[]; error?: { code: string; message: string } };
      if (!data.ok) {
        setMessage({ ok: false, text: data.error?.message || "连接失败" });
        if (data.error?.code === "network") setAllowForce(true);
        return;
      }
      setModels(data.models || []);
      await persist();
      if (mode === "text") window.location.reload();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "网络错误" });
      setAllowForce(true);
    } finally {
      setBusy(false);
    }
  }

  async function clearKey() {
    if (!keyExists || busy) return;
    setBusy(true);
    try {
      const body = mode === "vision"
        ? { vision: { provider: { kind, clearApiKey: true } } }
        : { provider: { kind, clearApiKey: true } };
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("删除失败");
      await load();
      setMessage({ ok: true, text: "已删除该渠道的 API Key" });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "删除失败" });
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="global-settings-button" onClick={() => setOpen(true)} aria-label="打开设置" title="设置"><span aria-hidden="true">⚙</span></button>
    {open && <div className="modal-overlay settings-overlay" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-head"><h2 id="settings-title">模型与应用设置</h2><button className="modal-close" onClick={() => setOpen(false)}>×</button></div>
        <label className="settings-field"><span>配置模块</span><select value={mode} onChange={(event) => setMode(event.target.value as Mode)}><option value="text">文字对话</option><option value="vision">识图模型</option></select></label>
        <label className="settings-field"><span>模型渠道</span><select value={kind} onChange={(event) => setKind(event.target.value as ProviderKind)}>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {mode === "vision" && <p className="settings-note">识图模型独立于文字对话配置。只有附图提问才会调用这里的模型与 Key。</p>}
        <label className="settings-field"><span>API 地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
        <label className="settings-field"><span>API Key {keyExists && <><em className="settings-current">已安全保存</em><button type="button" className="clear-key" onClick={clearKey}>删除</button></>}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={keyExists ? "留空则保持现有 Key" : "请输入 API Key"} autoComplete="off" /></label>
        <label className="settings-field"><span>{mode === "vision" ? "视觉模型" : "模型"}</span><input list="provider-models" value={model} onChange={(event) => setModel(event.target.value)} placeholder="模型名称"/><datalist id="provider-models">{models.map((item) => <option key={item} value={item}/>)}</datalist></label>
        {mode === "text" && <div className="settings-row"><label className="settings-field"><span>每日卡片上限</span><input type="number" min="1" value={daily} onChange={(event) => setDaily(event.target.value)}/></label><label className="settings-field"><span>最大并发</span><input type="number" min="1" max="10" value={concurrent} onChange={(event) => setConcurrent(event.target.value)}/></label></div>}
        {message && <p className={`settings-msg ${message.ok ? "ok" : "err"}`}>{message.text}</p>}
        <div className="modal-actions">{allowForce && <button className="settings-test" onClick={() => persist(false).then(() => setMessage({ ok: true, text: "已保存，可稍后测试" })).catch((error) => setMessage({ ok: false, text: error.message }))}>仍然保存</button>}<button className="primary" disabled={busy} onClick={saveAndTest}>{busy ? "正在验证…" : "保存并测试"}</button></div>
        <p className="settings-note">API Key 保存于 Windows 凭据管理器中，不会显示在页面或写入项目文件。</p>
      </section>
    </div>}
  </>;
}
