import { useCallback, useEffect, useRef, useState } from "react";
import { db, getSettings, updateSettings } from "../db/db";
import { suggestRecipes } from "../llm/adapter";
import { buildMessages } from "../llm/prompt";
import { useSession } from "./session";

const USE_COUNT_DECAY = 0.9;
const USE_COUNT_FLOOR = 0.05;

export type SuggestOutcome = { ok: true } | { ok: false; reason: "not-configured" | "error"; message: string };

/** 提案の実行。use_count 加算と last_selection 保存もここで行う */
export function useSuggest() {
  const s = useSession();
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const run = useCallback(
    async (opts: { another: boolean }): Promise<SuggestOutcome> => {
      const settings = await getSettings();
      const engine = settings[settings.engine];
      if (!engine.baseURL || !engine.model || (settings.engine === "gemini" && !engine.apiKey)) {
        return { ok: false, reason: "not-configured", message: "設定タブで LLM の接続情報を入力してください" };
      }

      const ids = [...s.selectedIds];
      const rows = ids.length ? await db.ingredients.bulkGet(ids) : [];
      const names = rows.flatMap((r) => (r ? [r.name] : []));
      const seasonings = (await db.seasonings.filter((x) => x.enabled).toArray()).map((x) => x.name);

      if (!opts.another) {
        await db.transaction("rw", db.ingredients, db.settings, async () => {
          // 使わなくなった食材が「よく使う」に居座らないよう、提案のたびに全体を減衰させてから選んだ分を加算する
          // 0.9 倍なので約 7 回で半減。小さくなりすぎた値は 0 に丸めて「使ったことがある」扱いから外す
          await db.ingredients.toCollection().modify((r) => {
            if (r.use_count > 0) {
              const v = r.use_count * USE_COUNT_DECAY;
              r.use_count = v < USE_COUNT_FLOOR ? 0 : v;
            }
          });
          const sel = new Set(ids);
          await db.ingredients.where("id").anyOf(ids).modify((r) => {
            if (sel.has(r.id!)) r.use_count += 1;
          });
          await updateSettings({ last_selection: ids });
        });
      }

      const messages = buildMessages({
        mode: s.mode,
        dishName: s.dishName.trim(),
        ingredients: [...names, ...s.freeItems],
        seasonings,
        servings: settings.servings,
        constraints: settings.constraints_text,
        excludeTitles: opts.another && s.suggestion ? s.suggestion.recipes.map((r) => r.title) : [],
      });

      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const result = await suggestRecipes(engine, messages, ac.signal);
        if (result.ok) {
          s.setSuggestion({ recipes: result.recipes, engine: settings.engine, model: result.model, savedIds: {} });
        } else {
          s.setSuggestion({ recipes: [], engine: settings.engine, model: result.model, rawText: result.rawText, savedIds: {} });
        }
        return { ok: true };
      } catch (e) {
        if (ac.signal.aborted) return { ok: false, reason: "error", message: "キャンセルしました" };
        const msg = e instanceof Error ? e.message : String(e);
        const hint = /Failed to fetch|Load failed|NetworkError/i.test(msg)
          ? "\n接続できません。VPN と baseURL を確認してください"
          : "";
        return { ok: false, reason: "error", message: msg + hint };
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [s],
  );

  return { run, loading, elapsed, cancel };
}
