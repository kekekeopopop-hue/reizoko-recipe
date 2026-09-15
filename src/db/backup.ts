import { db, getSettings } from "./db";
import type { Ingredient, Rating, Recipe, Seasoning, Settings } from "./schema";

const BACKUP_VERSION = 1;

type Backup = {
  app: "reizoko-recipe";
  version: number;
  exported_at: string;
  ingredients: Ingredient[];
  seasonings: Seasoning[];
  recipes: Recipe[];
  ratings: Rating[];
  settings: Omit<Settings, "gemini" | "custom"> & {
    gemini: { baseURL: string; model: string; extra?: string };
    custom: { baseURL: string; model: string; extra?: string };
  };
};

export async function buildBackup(): Promise<Backup> {
  const s = await getSettings();
  return {
    app: "reizoko-recipe",
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    ingredients: await db.ingredients.toArray(),
    seasonings: await db.seasonings.toArray(),
    recipes: await db.recipes.toArray(),
    ratings: await db.ratings.toArray(),
    // API キーは含めない
    settings: {
      ...s,
      gemini: { baseURL: s.gemini.baseURL, model: s.gemini.model, extra: s.gemini.extra ?? "" },
      custom: { baseURL: s.custom.baseURL, model: s.custom.model, extra: s.custom.extra ?? "" },
    },
  };
}

function fileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `reizoko-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
}

/** 共有シートで保存。共有できない環境ではダウンロードリンクにフォールバック */
export async function exportBackup(): Promise<"shared" | "downloaded"> {
  const json = JSON.stringify(await buildBackup(), null, 2);
  const file = new File([json], fileName(), { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "冷蔵庫レシピ バックアップ" });
    return "shared";
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}

export function parseBackup(text: string): Backup {
  const b = JSON.parse(text) as Partial<Backup>;
  if (b.app !== "reizoko-recipe" || typeof b.version !== "number") {
    throw new Error("このアプリのバックアップファイルではありません");
  }
  if (b.version > BACKUP_VERSION) {
    throw new Error("新しいバージョンのバックアップです。アプリを更新してください");
  }
  for (const k of ["ingredients", "seasonings", "recipes", "ratings", "settings"] as const) {
    if (!(k in b)) throw new Error(`バックアップに ${k} がありません`);
  }
  return b as Backup;
}

/** 全置換。API キーは現在の端末のものを維持する */
export async function importBackup(b: Backup): Promise<void> {
  const current = await getSettings();
  await db.transaction("rw", db.ingredients, db.seasonings, db.recipes, db.ratings, db.settings, async () => {
    await Promise.all([db.ingredients.clear(), db.seasonings.clear(), db.recipes.clear(), db.ratings.clear()]);
    await db.ingredients.bulkAdd(b.ingredients);
    await db.seasonings.bulkAdd(b.seasonings);
    await db.recipes.bulkAdd(b.recipes);
    await db.ratings.bulkAdd(b.ratings);
    await db.settings.put({
      ...current,
      ...b.settings,
      id: 1,
      gemini: { ...b.settings.gemini, apiKey: current.gemini.apiKey },
      custom: { ...b.settings.custom, apiKey: current.custom.apiKey },
    });
  });
}
