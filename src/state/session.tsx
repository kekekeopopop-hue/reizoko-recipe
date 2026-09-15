import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EngineKind, SuggestedRecipe } from "../db/schema";
import type { SuggestMode } from "../llm/prompt";

/** 提案結果とその由来。画面遷移をまたいでメモリに持つ */
export type SuggestionSet = {
  recipes: SuggestedRecipe[];
  engine: EngineKind;
  model: string;
  rawText?: string;
  /** results[index] を保存したときの recipes.id */
  savedIds: Record<number, number>;
};

type Session = {
  mode: SuggestMode;
  setMode: (m: SuggestMode) => void;
  dishName: string;
  setDishName: (s: string) => void;
  selectedIds: Set<number>;
  toggle: (id: number) => void;
  setSelectedIds: (ids: number[]) => void;
  clearSelection: () => void;
  freeItems: string[];
  addFreeItem: (s: string) => void;
  removeFreeItem: (s: string) => void;
  suggestion: SuggestionSet | null;
  setSuggestion: (s: SuggestionSet | null) => void;
  markSaved: (index: number, recipeId: number) => void;
};

const Ctx = createContext<Session | null>(null);

/**
 * Service Worker の更新やページ再読込で選択と提案結果を失わないよう sessionStorage に写す。
 * アプリを完全に閉じると消えるので「アプリを閉じるまで保持」の仕様どおりになる
 */
const STORAGE_KEY = "reizoko-session";
type Persisted = { mode: SuggestMode; dishName: string; selectedIds: number[]; freeItems: string[]; suggestion: SuggestionSet | null };
function load(): Partial<Persisted> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(load);
  const [mode, setMode] = useState<SuggestMode>(initial.mode ?? "ingredients");
  const [dishName, setDishName] = useState(initial.dishName ?? "");
  const [selectedIds, setSelected] = useState<Set<number>>(() => new Set(initial.selectedIds ?? []));
  const [freeItems, setFreeItems] = useState<string[]>(initial.freeItems ?? []);
  const [suggestion, setSuggestion] = useState<SuggestionSet | null>(initial.suggestion ?? null);

  useEffect(() => {
    try {
      const data: Persisted = { mode, dishName, selectedIds: [...selectedIds], freeItems, suggestion };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 容量超過やプライベートモードでは諦める
    }
  }, [mode, dishName, selectedIds, freeItems, suggestion]);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setSelectedIds = useCallback((ids: number[]) => setSelected(new Set(ids)), []);
  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setFreeItems([]);
  }, []);
  const addFreeItem = useCallback((s: string) => {
    const t = s.trim();
    if (!t) return;
    setFreeItems((prev) => (prev.includes(t) ? prev : [...prev, t]));
  }, []);
  const removeFreeItem = useCallback((s: string) => setFreeItems((prev) => prev.filter((x) => x !== s)), []);
  const markSaved = useCallback((index: number, recipeId: number) => {
    setSuggestion((prev) => (prev ? { ...prev, savedIds: { ...prev.savedIds, [index]: recipeId } } : prev));
  }, []);

  const value = useMemo<Session>(
    () => ({
      mode, setMode, dishName, setDishName,
      selectedIds, toggle, setSelectedIds, clearSelection,
      freeItems, addFreeItem, removeFreeItem,
      suggestion, setSuggestion, markSaved,
    }),
    [mode, dishName, selectedIds, toggle, setSelectedIds, clearSelection, freeItems, addFreeItem, removeFreeItem, suggestion, markSaved],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider がありません");
  return v;
}
