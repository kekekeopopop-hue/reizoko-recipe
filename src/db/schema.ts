import type { CategoryId } from "./seed-ingredients";

export type Ingredient = {
  id?: number;
  name: string;
  category: CategoryId;
  sort_order: number;
  use_count: number;
  is_active: boolean;
};

export type Seasoning = {
  id?: number;
  name: string;
  enabled: boolean;
};

export type RecipeIngredient = { name: string; amount: string };

/** LLM が返す1レシピ。保存前の状態 */
export type SuggestedRecipe = {
  title: string;
  time_min: number;
  ingredients: RecipeIngredient[];
  missing_ingredients: string[];
  steps: string[];
};

export type Recipe = SuggestedRecipe & {
  id?: number;
  engine: EngineKind;
  model: string;
  created_at: string;
};

export type Rating = {
  recipe_id: number;
  taste_score: number | null;
  effort_score: number | null;
  cooked_count: number;
  note: string;
  updated_at: string;
};

export type EngineKind = "gemini" | "custom";

export type EngineConfig = { baseURL: string; model: string; apiKey: string };

export type Settings = {
  id: 1;
  engine: EngineKind;
  gemini: EngineConfig;
  custom: EngineConfig;
  servings: number;
  keep_awake: boolean;
  constraints_text: string;
  last_selection: number[];
};

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  engine: "gemini",
  gemini: { baseURL: GEMINI_BASE_URL, model: DEFAULT_GEMINI_MODEL, apiKey: "" },
  custom: { baseURL: "", model: "", apiKey: "" },
  servings: 2,
  keep_awake: true,
  constraints_text: "",
  last_selection: [],
};
