import { useCallback, useEffect, useRef, useState } from "react";
import { db, getSettings, updateSettings } from "../db/db";
import { suggestRecipes } from "../llm/adapter";
import { buildMessages } from "../llm/prompt";
import { useSession } from "./session";

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
          for (const id of ids) {
            const r = await db.ingredients.get(id);
            if (r) await db.ingredients.update(id, { use_count: r.use_count + 1 });
          }
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
