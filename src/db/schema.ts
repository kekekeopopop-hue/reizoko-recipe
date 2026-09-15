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

/**
 * extra: リクエスト本文にそのままマージする追加パラメータ（JSON 文字列）。
 * provider ごとの分岐コードを書かず、thinking の無効化などを設定値の差で吸収するためのもの。
 * 例: Qwen `{"enable_thinking":false}`、Gemini `{"reasoning_effort":"low"}`
 */
export type EngineConfig = { baseURL: string; model: string; apiKey: string; extra?: string };

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
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** レシピ提案に長い推論は要らない。thinking を弱めて応答を速くする */
export const DEFAULT_GEMINI_EXTRA = '{"reasoning_effort":"low"}';

/**
 * カスタムエンジンのプリセット。中国からも日本からも VPN なしで届き、
 * ブラウザ直接呼び出し（CORS）が通ることを確認済みのもの。
 * Qwen3 系は thinking が既定 ON で、JSON を出す前に推論トークンを大量に消費して 90 秒近くかかるので
 * extra で無効化する（DashScope は extra_body 相当を本文トップレベルで受け付ける）
 */
export const CUSTOM_PRESETS: { label: string; baseURL: string; model: string; extra: string }[] = [
  { label: "Qwen (Alibaba 中国)", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3.8-flash", extra: '{"enable_thinking":false}' },
  { label: "Qwen (Alibaba 国際)", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen3.8-flash", extra: '{"enable_thinking":false}' },
  { label: "DeepSeek", baseURL: "https://api.deepseek.com", model: "deepseek-flash", extra: "" },
  { label: "Kimi (Moonshot)", baseURL: "https://api.moonshot.cn/v1", model: "kimi-latest", extra: "" },
];

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  engine: "gemini",
  gemini: { baseURL: GEMINI_BASE_URL, model: DEFAULT_GEMINI_MODEL, apiKey: "", extra: DEFAULT_GEMINI_EXTRA },
  custom: { baseURL: "", model: "", apiKey: "", extra: "" },
  servings: 2,
  keep_awake: true,
  constraints_text: "",
  last_selection: [],
};
