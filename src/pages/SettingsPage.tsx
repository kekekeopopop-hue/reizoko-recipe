import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Segment } from "../components/Segment";
import { Switch } from "../components/Switch";
import { exportBackup, importBackup, parseBackup } from "../db/backup";
import { db, updateSettings } from "../db/db";
import { GEMINI_BASE_URL, type EngineConfig, type EngineKind, type Settings } from "../db/schema";
import { listModels } from "../llm/adapter";

const SERVINGS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}` }));

export function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const seasonings = useLiveQuery(() => db.seasonings.toArray(), []);
  const location = useLocation();
  const notice = (location.state as { message?: string } | null)?.message;
  const [msg, setMsg] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!settings) return <div className="page with-tabs" />;

  const engine: EngineKind = settings.engine;
  const cfg: EngineConfig = settings[engine];
  const setCfg = (patch: Partial<EngineConfig>) =>
    updateSettings({ [engine]: { ...cfg, ...patch } } as Partial<Settings>);

  const testModels = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const list = await listModels(cfg);
      setModels(list);
      setMsg(list.length ? `接続 OK: ${list.length} モデル` : "接続はできましたがモデルが返りませんでした");
    } catch (e) {
      setModels(null);
      setMsg(`接続に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    try {
      const how = await exportBackup();
      setMsg(how === "shared" ? "共有シートから保存してください" : "ダウンロードしました");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg(`エクスポート失敗: ${(e as Error).message}`);
    }
  };

  const doImport = async (file: File) => {
    try {
      const b = parseBackup(await file.text());
      if (!confirm(`${b.exported_at.slice(0, 10)} のバックアップ（レシピ ${b.recipes.length} 件）で、この端末のデータを置き換えます。よろしいですか？`)) return;
      await importBackup(b);
      setMsg("インポートしました");
    } catch (e) {
      setMsg(`インポート失敗: ${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="page with-tabs">
      <div className="page-header"><h1>設定</h1></div>
      {notice && <div className="error">{notice}</div>}

      <h2>LLM</h2>
      <Segment
        options={[{ value: "gemini", label: "Gemini" }, { value: "custom", label: "カスタム (OpenAI互換)" }]}
        value={engine}
        onChange={(v) => { setModels(null); void updateSettings({ engine: v }); }}
      />
      <div style={{ height: 12 }} />
      {engine === "custom" && (
        <div className="field">
          <label>baseURL（例: https://mac.tailnet.ts.net/v1）</label>
          <input key={`${engine}-base`} className="mono" defaultValue={cfg.baseURL} inputMode="url" autoCapitalize="off" autoCorrect="off"
            placeholder="https://.../v1" onBlur={(e) => void setCfg({ baseURL: e.target.value.trim() })} />
        </div>
      )}
      {engine === "gemini" && cfg.baseURL !== GEMINI_BASE_URL && (
        <div className="hint">baseURL: {cfg.baseURL}</div>
      )}
      <div className="field">
        <label>API キー{engine === "custom" ? "（Ollama なら任意の文字列）" : ""}</label>
        <input key={`${engine}-key`} className="mono" type="password" defaultValue={cfg.apiKey} autoCapitalize="off" autoCorrect="off"
          onBlur={(e) => void setCfg({ apiKey: e.target.value.trim() })} />
      </div>
      <div className="field">
        <label>モデル名</label>
        <input key={`${engine}-model-${cfg.model}`} className="mono" defaultValue={cfg.model} autoCapitalize="off" autoCorrect="off"
          onBlur={(e) => void setCfg({ model: e.target.value.trim() })} />
        <button type="button" className="btn small" style={{ marginTop: 8 }} disabled={busy} onClick={() => void testModels()}>
          接続テスト（モデル一覧を取得）
        </button>
        {models && (
          <div className="models">
            {models.map((m) => (
              <button key={m} type="button" className={m === cfg.model ? "on" : ""} onClick={() => void setCfg({ model: m })}>{m}</button>
            ))}
          </div>
        )}
      </div>

      <h2>提案</h2>
      <div className="field">
        <label>人数</label>
        <Segment options={SERVINGS} value={settings.servings} onChange={(v) => void updateSettings({ servings: v })} />
      </div>
      <div className="field">
        <label>制約（苦手な食材、時間の上限など。毎回そのまま LLM に渡します）</label>
        <textarea key="constraints" rows={3} defaultValue={settings.constraints_text} placeholder="例: 辛いものは控えめ。平日は30分以内"
          onBlur={(e) => void updateSettings({ constraints_text: e.target.value })} />
      </div>
      <div className="section">
        <div className="switch-row">
          <span>レシピ表示中は画面を消さない</span>
          <Switch on={settings.keep_awake} onChange={(v) => void updateSettings({ keep_awake: v })} />
        </div>
      </div>

      <h2>常備調味料（ON のものは常に「ある」扱い）</h2>
      <div className="section">
        {(seasonings ?? []).map((x) => (
          <div key={x.id} className="switch-row">
            <span>{x.name}</span>
            <Switch on={x.enabled} onChange={(v) => void db.seasonings.update(x.id!, { enabled: v })} />
          </div>
        ))}
      </div>

      <h2>バックアップ</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => void doExport()}>エクスポート</button>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>インポート</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
      </div>
      <div className="hint">API キーはエクスポートに含まれません。インポートはこの端末のデータを全て置き換えます</div>

      {msg && <div className="error" style={{ background: "#f1e9e0", color: "var(--text)" }}>{msg}</div>}
      <div className="hint">v{__APP_VERSION__}</div>
    </div>
  );
}
