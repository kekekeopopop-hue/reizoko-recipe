import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { RatingSheet } from "../components/RatingSheet";
import { RecipeCard } from "../components/RecipeCard";
import { db } from "../db/db";

export function SavedPage() {
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const ratings = useLiveQuery(() => db.ratings.toArray(), []);
  const [rateId, setRateId] = useState<number | null>(null);

  const rows = useMemo(() => {
    if (!recipes) return [];
    const rmap = new Map((ratings ?? []).map((r) => [r.recipe_id, r]));
    const score = (id: number) => {
      const r = rmap.get(id);
      return r && r.taste_score !== null && r.effort_score !== null ? r.taste_score + r.effort_score : -1;
    };
    return recipes
      .map((rec) => ({ rec, rating: rmap.get(rec.id!), score: score(rec.id!) }))
      .sort((a, b) => b.score - a.score || b.rec.created_at.localeCompare(a.rec.created_at));
  }, [recipes, ratings]);

  return (
    <div className="page with-tabs">
      <div className="page-header"><h1>保存したレシピ</h1></div>
      {recipes && recipes.length === 0 && <div className="empty">まだありません。提案からレシピを開いて保存してください</div>}
      {rows.map(({ rec, rating, score }) => {
        const unrated = !!rating && rating.cooked_count > 0 && score < 0;
        return (
          <RecipeCard
            key={rec.id}
            recipe={rec}
            to={`/recipes/${rec.id}`}
            extra={
              <>
                {score >= 0 && <span className="badge score">味 {rating!.taste_score} / 手間 {rating!.effort_score}</span>}
                {rating && rating.cooked_count > 0 && <span>{rating.cooked_count}回作った</span>}
                {unrated && (
                  <button
                    type="button"
                    className="badge warn"
                    onClick={(e) => { e.preventDefault(); setRateId(rec.id!); }}
                  >
                    未評価 → 評価する
                  </button>
                )}
              </>
            }
          />
        );
      })}
      {rateId !== null && <RatingSheet recipeId={rateId} onClose={() => setRateId(null)} />}
    </div>
  );
}
