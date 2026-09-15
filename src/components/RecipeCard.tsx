import { Link } from "react-router-dom";
import type { SuggestedRecipe } from "../db/schema";

type Props = { recipe: SuggestedRecipe; to: string; extra?: React.ReactNode };

export function RecipeCard({ recipe, to, extra }: Props) {
  const miss = recipe.missing_ingredients.filter((s) => s.trim());
  return (
    <Link className="card" to={to}>
      <div className="title">{recipe.title}</div>
      <div className="meta">
        {recipe.time_min > 0 && <span>約{recipe.time_min}分</span>}
        {miss.length === 0 ? (
          <span className="badge ok">手持ちで作れる</span>
        ) : (
          <span className="badge miss">足りない: {miss.join("、")}</span>
        )}
        {extra}
      </div>
    </Link>
  );
}
