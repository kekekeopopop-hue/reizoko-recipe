export type SuggestMode = "ingredients" | "dish";

export type SuggestInput = {
  mode: SuggestMode;
  dishName: string;
  ingredients: string[]; // 選択食材 + 自由入力
  seasonings: string[]; // enabled のみ
  servings: number;
  constraints: string;
  excludeTitles: string[]; // 「別の案を出す」のときだけ
};

export type ChatMessage = { role: "system" | "user"; content: string };

export function buildMessages(input: SuggestInput): ChatMessage[] {
  const lines: string[] = [];
  lines.push(`人数: ${input.servings}人分`);
  if (input.mode === "dish") {
    lines.push(`作りたい料理: ${input.dishName}`);
    lines.push("この料理（またはその近い変種）のレシピを3件。");
  }
  lines.push(`手持ちの食材: ${input.ingredients.length ? input.ingredients.join("、") : "（指定なし）"}`);
  lines.push(`常備調味料: ${input.seasonings.join("、")}`);
  if (input.constraints.trim()) lines.push(`制約: ${input.constraints.trim()}`);
  if (input.excludeTitles.length) lines.push(`次の料理は除外: ${input.excludeTitles.join("、")}`);
  lines.push("");
  lines.push("ルール:");
  lines.push("- 手持ちの食材と常備調味料でできる料理を優先する。3件は方向性を変える");
  lines.push("- 手持ちにも常備調味料にもない材料は missing_ingredients に列挙する。少ないほど良い");
  lines.push("- ingredients には分量を人数分で書く。調味料も含める");
  lines.push("- steps は各1〜2文で簡潔に。番号は付けない");
  lines.push("- time_min は調理時間の目安（分）");
  lines.push("- すべて日本語");

  return [
    {
      role: "system",
      content: "あなたは家庭料理のレシピ提案アシスタント。指定された JSON スキーマに従って、レシピをちょうど3件返す。",
    },
    { role: "user", content: lines.join("\n") },
  ];
}
