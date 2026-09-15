import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RatingSheet } from "../components/RatingSheet";
import { db, deleteRecipe, markCooked, nowIso } from "../db/db";
import type { Rating, Recipe, SuggestedRecipe } from "../db/schema";
import { useWakeLock } from "../hooks/useWakeLock";
import { useSession } from "../state/session";

const BookmarkIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
  </svg>
);

/** /results/:index（提案から）と /recipes/:id（保存済み）の両方を扱う */
export function RecipeDetailPage({ source }: { source: "suggestion" | "saved" }) {
  const params = useParams();
  const nav = useNavigate();
  const s = useSession();

  const index = source === "suggestion" ? Number(params.index) : -1;
  const suggested: SuggestedRecipe | undefined = source === "suggestion" ? s.suggestion?.recipes[index] : undefined;
  const suggestedSavedId = source === "suggestion" ? s.suggestion?.savedIds[index] : undefined;
  const routeId = source === "saved" ? Number(params.id) : suggestedSavedId;

  const saved = useLiveQuery(async (): Promise<Recipe | undefined> => (routeId !== undefined ? db.recipes.get(routeId) : undefined), [routeId]);
  const rating = useLiveQuery(async (): Promise<Rating | undefined> => (routeId !== undefined ? db.ratings.get(routeId) : undefined), [routeId]);
  const settings = useLiveQuery(() => db.settings.get(1), []);
  useWakeLock(settings?.keep_awake ?? true);

  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const recipe: SuggestedRecipe | Recipe | undefined = saved ?? suggested;
  const isSaved = routeId !== undefined && !!saved;

  useEffect(() => {
    if (source === "suggestion" && !s.suggestion) nav("/", { replace: true });
  }, [source, s.suggestion, nav]);

  if (!recipe) {
    if (source === "saved" && saved === undefined && routeId !== undefined) return <div className="page empty">読み込み中</div>;
    return null;
  }

  const save = async () => {
    if (!s.suggestion || !suggested) return;
    const id = await db.recipes.add({ ...suggested, engine: s.suggestion.engine, model: s.suggestion.model, created_at: nowIso() });
    s.markSaved(index, id as number);
    setToast("保存しました");
  };

  const cooked = async () => {
    if (routeId === undefined) return;
    await markCooked(routeId);
    setSheet(true);
  };

  const remove = async () => {
    if (routeId === undefined) return;
    if (!confirm("このレシピを削除しますか？評価も消えます")) return;
    await deleteRecipe(routeId);
    nav(source === "saved" ? "/saved" : "/results", { replace: true });
  };

  const toggleDone = (i: number) =>
    setDone((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const miss = recipe.missing_ingredients.filter((x) => x.trim());

  return (
    <div className="page detail">
      <div className="page-header">
        <div style={{ flex: 1 }} />
        <div className="actions">
          {isSaved ? (
            <>
              <button type="button" className="btn small" onClick={() => void cooked()}>
                作った{rating && rating.cooked_count > 0 ? ` (${rating.cooked_count})` : ""}
              </button>
              <button type="button" className="icon-btn" aria-label="メニュー" onClick={() => setMenu((m) => !m)}>…</button>
            </>
          ) : (
            <button type="button" className="icon-btn" aria-label="保存" onClick={() => void save()}>
              <BookmarkIcon filled={false} />
            </button>
          )}
        </div>
      </div>
      {menu && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
          {rating && (rating.taste_score !== null || rating.effort_score !== null) && (
            <button type="button" className="btn small" onClick={() => { setMenu(false); setSheet(true); }}>評価を編集</button>
          )}
          <button type="button" className="btn small danger" onClick={() => { setMenu(false); void remove(); }}>削除</button>
        </div>
      )}

      <div className="title">{recipe.title}</div>
      <div className="meta" style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "var(--muted)", fontSize: 14 }}>
        {recipe.time_min > 0 && <span>約{recipe.time_min}分</span>}
        {settings && <span>{settings.servings}人分</span>}
        {rating && rating.taste_score !== null && rating.effort_score !== null && (
          <span className="badge score">味 {rating.taste_score} / 手間 {rating.effort_score}</span>
        )}
      </div>
      {miss.length > 0 && <div style={{ marginTop: 8 }}><span className="badge miss">足りない: {miss.join("、")}</span></div>}
      {rating?.note && <div style={{ marginTop: 8, fontSize: 14, color: "var(--muted)" }}>メモ: {rating.note}</div>}

      <h2>材料</h2>
      <ul>
        {recipe.ingredients.map((x, i) => (
          <li key={i} className="ing"><span>{x.name}</span><span className="amt">{x.amount}</span></li>
        ))}
      </ul>

      <h2>手順（タップで済みに）</h2>
      <ol>
        {recipe.steps.map((st, i) => (
          <li key={i} className={`step ${done.has(i) ? "done" : ""}`} onClick={() => toggleDone(i)}>
            <span className="n">{i + 1}</span><span>{st}</span>
          </li>
        ))}
      </ol>

      {saved && <div className="hint">{saved.engine} / {saved.model}</div>}

      {sheet && routeId !== undefined && <RatingSheet recipeId={routeId} onClose={() => setSheet(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
