import type { EngineConfig, SuggestedRecipe } from "../db/schema";
import { RECIPES_JSON_SCHEMA } from "./schema";
import type { ChatMessage } from "./prompt";

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly rawText?: string,
  ) {
    super(message);
  }
}

export type SuggestResult =
  | { ok: true; recipes: SuggestedRecipe[]; model: string }
  | { ok: false; rawText: string; model: string; error: string };

function normalizeBase(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, "");
}

type JsonMode = "json_schema" | "json_object" | "none";
const MODE_ORDER: JsonMode[] = ["json_schema", "json_object", "none"];
/** baseURL ごとに、通った出力方式を覚えておく（同じ 400 を毎回踏まないため） */
const modeCache = new Map<string, JsonMode>();

function responseFormat(mode: JsonMode): Record<string, unknown> | undefined {
  if (mode === "json_schema") {
    return { response_format: { type: "json_schema", json_schema: { name: "recipes", schema: RECIPES_JSON_SCHEMA } } };
  }
  if (mode === "json_object") return { response_format: { type: "json_object" } };
  return undefined;
}

/** 設定の追加パラメータ（JSON 文字列）をオブジェクトにする。空なら {}。壊れていれば LLMError */
export function parseExtra(extra: string | undefined): Record<string, unknown> {
  const t = (extra ?? "").trim();
  if (!t) return {};
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    throw new LLMError("追加パラメータが JSON として読めません。設定タブを確認してください");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new LLMError("追加パラメータは JSON オブジェクトにしてください");
  return v as Record<string, unknown>;
}

async function postChat(engine: EngineConfig, messages: ChatMessage[], mode: JsonMode, signal?: AbortSignal): Promise<Response> {
  // extra を先に展開し、model / messages / response_format は上書きされないようにする
  const body = { ...parseExtra(engine.extra), model: engine.model, messages, ...responseFormat(mode) };
  return fetch(`${normalizeBase(engine.baseURL)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${engine.apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * structured outputs を最優先し、provider が response_format を受け付けない（400）ときは
 * json_object、さらにダメなら指定なしに落とす。プロンプト側にもスキーマを書いてあるので
 * どの方式でも同じ形の JSON が返る前提
 */
async function chatCompletion(engine: EngineConfig, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const base = normalizeBase(engine.baseURL);
  const start = MODE_ORDER.indexOf(modeCache.get(base) ?? "json_schema");
  let res: Response | null = null;
  for (let i = start; i < MODE_ORDER.length; i++) {
    const mode = MODE_ORDER[i];
    res = await postChat(engine, messages, mode, signal);
    if (res.ok) {
      modeCache.set(base, mode);
      break;
    }
    if (res.status !== 400 || mode === "none") break;
    // 400 は response_format 非対応の可能性が高いので次の方式へ
  }
  if (!res || !res.ok) {
    const body = res ? await res.text().catch(() => "") : "";
    throw new LLMError(`HTTP ${res?.status ?? 0}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new LLMError("応答が空でした");
  return content;
}

/** 前後の ``` や余計なテキストを剥がしてから parse する */
function parseRecipes(text: string): SuggestedRecipe[] {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  const obj = JSON.parse(t) as { recipes?: unknown };
  if (!Array.isArray(obj.recipes) || obj.recipes.length === 0) throw new Error("recipes がありません");
  return obj.recipes.map((r: unknown) => {
    const x = r as Partial<SuggestedRecipe>;
    if (typeof x.title !== "string" || !Array.isArray(x.steps)) throw new Error("レシピの形式が不正です");
    return {
      title: x.title,
      time_min: typeof x.time_min === "number" ? Math.round(x.time_min) : 0,
      ingredients: Array.isArray(x.ingredients)
        ? x.ingredients.map((i) => ({ name: String(i?.name ?? ""), amount: String(i?.amount ?? "") }))
        : [],
      missing_ingredients: Array.isArray(x.missing_ingredients) ? x.missing_ingredients.map(String) : [],
      steps: x.steps.map(String),
    };
  });
}

/** 1回リトライし、それでもダメなら生テキストを返す */
export async function suggestRecipes(
  engine: EngineConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<SuggestResult> {
  let lastText = "";
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs =
      attempt === 0
        ? messages
        : [...messages, { role: "user" as const, content: "JSON だけを返してください。説明文は不要です。" }];
    lastText = await chatCompletion(engine, msgs, signal);
    try {
      return { ok: true, recipes: parseRecipes(lastText), model: engine.model };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, rawText: lastText, model: engine.model, error: lastError };
}

/** 設定画面の接続テスト用。OpenAI 互換の GET /models */
export async function listModels(engine: EngineConfig): Promise<string[]> {
  const res = await fetch(`${normalizeBase(engine.baseURL)}/models`, {
    headers: { Authorization: `Bearer ${engine.apiKey}` },
  });
  if (!res.ok) throw new LLMError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: { id?: string }[] };
  return (json.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean);
}
