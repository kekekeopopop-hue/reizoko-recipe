import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingOverlay } from "../components/Overlay";
import { Segment } from "../components/Segment";
import { db } from "../db/db";
import { CATEGORIES, type CategoryId } from "../db/seed-ingredients";
import { useSession } from "../state/session";
import { useSuggest } from "../state/useSuggest";

type Tab = "frequent" | CategoryId;

export function SuggestPage() {
  const s = useSession();
  const nav = useNavigate();
  const { run, loading, elapsed, cancel } = useSuggest();
  const [tab, setTab] = useState<Tab | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const ingredients = useLiveQuery(() => db.ingredients.filter((x) => x.is_active).sortBy("sort_order"), []);
  const settings = useLiveQuery(() => db.settings.get(1), []);

  const frequent = useMemo(
    () =>
      (ingredients ?? [])
        .filter((x) => x.use_count > 0)
        .sort((a, b) => b.use_count - a.use_count || a.sort_order - b.sort_order)
        .slice(0, 12),
    [ingredients],
  );

  // 初回は「よく使う」が空なので野菜を出す
  useEffect(() => {
    if (tab === null && ingredients) setTab(frequent.length > 0 ? "frequent" : "vegetable");
  }, [tab, ingredients, frequent.length]);

  // 編集モードは「よく使う」タブ限定。タブを離れるか一覧が空になったら抜ける
  useEffect(() => {
    if (tab !== "frequent" || frequent.length === 0) setEditing(false);
  }, [tab, frequent.length]);

  const removeFromFrequent = (id: number) => void db.ingredients.update(id, { use_count: 0 });

  const visible = useMemo(() => {
    if (!ingredients || !tab) return [];
    return tab === "frequent" ? frequent : ingredients.filter((x) => x.category === tab);
  }, [ingredients, tab, frequent]);

  const selected = useMemo(() => (ingredients ?? []).filter((x) => s.selectedIds.has(x.id!)), [ingredients, s.selectedIds]);
  const hasSelection = selected.length > 0 || s.freeItems.length > 0;
  const canRun = s.mode === "dish" ? s.dishName.trim().length > 0 : hasSelection;
  const lastSelection = settings?.last_selection ?? [];

  const submit = async () => {
    setError(null);
    const r = await run({ another: false });
    if (r.ok) nav("/results");
    else if (r.reason === "not-configured") nav("/settings", { state: { message: r.message } });
    else setError(r.message);
  };

  const addFree = () => {
    s.addFreeItem(freeText);
    setFreeText("");
    setFreeOpen(false);
  };

  return (
    <div className="page with-cta">
      <div className="page-header"><h1>今日なに作る？</h1></div>
      <Segment
        options={[{ value: "ingredients", label: "食材から" }, { value: "dish", label: "料理名から" }]}
        value={s.mode}
        onChange={s.setMode}
      />

      <div className="chips">
        {!hasSelection && lastSelection.length > 0 && !freeOpen && (
          <button type="button" className="btn small" onClick={() => s.setSelectedIds(lastSelection)}>前回の選択を復元</button>
        )}
        {selected.map((x) => (
          <button key={x.id} type="button" className="chip" onClick={() => s.toggle(x.id!)}>
            {x.name}<span className="x">×</span>
          </button>
        ))}
        {s.freeItems.map((t) => (
          <button key={t} type="button" className="chip free" onClick={() => s.removeFreeItem(t)}>
            {t}<span className="x">×</span>
          </button>
        ))}
        {!freeOpen && (
          <button type="button" className="chip add" onClick={() => setFreeOpen(true)}>＋ 自由入力</button>
        )}
        {hasSelection && !freeOpen && (
          <button type="button" className="btn ghost small chips-actions" onClick={s.clearSelection}>全解除</button>
        )}
      </div>
      {freeOpen && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            autoFocus
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFree()}
            placeholder="リストにない食材"
            enterKeyHint="done"
          />
          <button type="button" className="btn" onClick={addFree} disabled={!freeText.trim()}>追加</button>
          <button type="button" className="btn ghost" onClick={() => { setFreeOpen(false); setFreeText(""); }}>閉じる</button>
        </div>
      )}

      {s.mode === "ingredients" ? (
        <>
          <div className="cats">
            <button type="button" className={tab === "frequent" ? "on" : ""} onClick={() => setTab("frequent")}>よく使う</button>
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={tab === c.id ? "on" : ""} onClick={() => setTab(c.id)}>{c.label}</button>
            ))}
          </div>
          {tab === "frequent" && visible.length > 0 && (
            <div className="grid-head">
              <span className="hint">{editing ? "タップで「よく使う」から外します。使えばまた戻ります" : "使った回数の多い順"}</span>
              <button type="button" className="link" onClick={() => setEditing((v) => !v)}>{editing ? "完了" : "編集"}</button>
            </div>
          )}
          {tab === "frequent" && visible.length === 0 ? (
            <div className="empty">提案を出すと、よく使う食材がここに並びます</div>
          ) : (
            <div className={editing ? "grid editing" : "grid"}>
              {visible.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={!editing && s.selectedIds.has(x.id!) ? "on" : ""}
                  onClick={() => (editing ? removeFromFrequent(x.id!) : s.toggle(x.id!))}
                >
                  {x.name}
                  {editing && <span className="rm" aria-hidden="true">×</span>}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="field">
          <label>作りたい料理</label>
          <input
            value={s.dishName}
            onChange={(e) => s.setDishName(e.target.value)}
            placeholder="麻婆豆腐、和風パスタ、など"
            enterKeyHint="go"
            onKeyDown={(e) => e.key === "Enter" && canRun && void submit()}
          />
          <div className="hint">選んである食材があれば、それを使う前提で提案します</div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="cta-wrap">
        <button type="button" className="btn primary" disabled={!canRun || loading} onClick={() => void submit()}>提案してもらう</button>
      </div>
      {loading && <LoadingOverlay elapsed={elapsed} label="レシピを考えています" onCancel={cancel} />}
    </div>
  );
}
