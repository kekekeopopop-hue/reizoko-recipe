import Dexie, { type EntityTable } from "dexie";
import type { Ingredient, Rating, Recipe, Seasoning, Settings } from "./schema";
import { CUSTOM_PRESETS, DEFAULT_GEMINI_EXTRA, DEFAULT_SETTINGS } from "./schema";
import { INGREDIENTS, SEASONINGS } from "./seed-ingredients";

export class RecipeDB extends Dexie {
  ingredients!: EntityTable<Ingredient, "id">;
  seasonings!: EntityTable<Seasoning, "id">;
  recipes!: EntityTable<Recipe, "id">;
  ratings!: EntityTable<Rating, "recipe_id">;
  settings!: EntityTable<Settings, "id">;

  constructor() {
    super("reizoko-recipe");
    this.version(1).stores({
      ingredients: "++id, &name, category",
      seasonings: "++id, &name",
      recipes: "++id, created_at",
      ratings: "&recipe_id",
      settings: "id",
    });
  }
}

export const db = new RecipeDB();

/** 初回起動時にストアが空なら seed を投入する */
export async function ensureSeeded(): Promise<void> {
  await db.transaction("rw", db.ingredients, db.seasonings, db.settings, async () => {
    if ((await db.ingredients.count()) === 0) {
      await db.ingredients.bulkAdd(
        INGREDIENTS.map((x, i) => ({ ...x, sort_order: i, use_count: 0, is_active: true })),
      );
    }
    // 調味料は seed に後から足した分も既存端末に届くよう、未登録の名前だけ追記する。既存の ON/OFF は触らない
    const existing = new Set((await db.seasonings.toArray()).map((x) => x.name));
    const missing = SEASONINGS.filter((x) => !existing.has(x.name));
    if (missing.length > 0) {
      await db.seasonings.bulkAdd(missing.map((x) => ({ ...x })));
    }
    const s = await db.settings.get(1);
    if (!s) {
      await db.settings.add(DEFAULT_SETTINGS);
    } else if (s.gemini.extra === undefined || s.custom.extra === undefined) {
      // extra 追加前に作られた設定行への一度きりの補完。プリセット由来の baseURL ならその extra を入れる
      const preset = CUSTOM_PRESETS.find((p) => p.baseURL === s.custom.baseURL);
      await db.settings.update(1, {
        gemini: { ...s.gemini, extra: s.gemini.extra ?? DEFAULT_GEMINI_EXTRA },
        custom: { ...s.custom, extra: s.custom.extra ?? preset?.extra ?? "" },
      });
    }
  });
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(1)) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<void> {
  await db.settings.update(1, patch);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 「作った」: cooked_count を +1。ratings 行がなければ作る */
export async function markCooked(recipeId: number): Promise<void> {
  await db.transaction("rw", db.ratings, async () => {
    const r = await db.ratings.get(recipeId);
    if (r) {
      await db.ratings.update(recipeId, { cooked_count: r.cooked_count + 1, updated_at: nowIso() });
    } else {
      await db.ratings.add({
        recipe_id: recipeId,
        taste_score: null,
        effort_score: null,
        cooked_count: 1,
        note: "",
        updated_at: nowIso(),
      });
    }
  });
}

export async function saveRating(
  recipeId: number,
  patch: { taste_score: number | null; effort_score: number | null; note: string },
): Promise<void> {
  await db.transaction("rw", db.ratings, async () => {
    const r = await db.ratings.get(recipeId);
    if (r) {
      await db.ratings.update(recipeId, { ...patch, updated_at: nowIso() });
    } else {
      await db.ratings.add({ recipe_id: recipeId, cooked_count: 0, ...patch, updated_at: nowIso() });
    }
  });
}

export async function deleteRecipe(recipeId: number): Promise<void> {
  await db.transaction("rw", db.recipes, db.ratings, async () => {
    await db.recipes.delete(recipeId);
    await db.ratings.delete(recipeId);
  });
}
