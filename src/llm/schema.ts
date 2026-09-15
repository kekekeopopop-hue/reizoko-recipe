/** structured outputs 用 JSON Schema。CLAUDE.md §7 の出力スキーマそのもの */
export const RECIPES_JSON_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          time_min: { type: "integer" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, amount: { type: "string" } },
              required: ["name", "amount"],
            },
          },
          missing_ingredients: { type: "array", items: { type: "string" } },
          steps: { type: "array", items: { type: "string" } },
        },
        required: ["title", "time_min", "ingredients", "missing_ingredients", "steps"],
      },
    },
  },
  required: ["recipes"],
} as const;
