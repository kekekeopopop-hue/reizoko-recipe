import Dexie, { type EntityTable } from "dexie";
import type { Ingredient, Rating, Recipe, Seasoning, Settings } from "./schema";
import { DEFAULT_SETTINGS } from "./schema";
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
    if ((await db.seasonings.count()) === 0) {
      await db.seasonings.bulkAdd(SEASONINGS.map((x) => ({ ...x })));
    }
    if (!(await db.settings.get(1))) {
      await db.settings.add(DEFAULT_SETTINGS);
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
