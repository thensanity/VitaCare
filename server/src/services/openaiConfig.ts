/**
 * Runtime inference uses the OpenAI HTTP API (Chat Completions).
 * For up-to-date model names, use the OpenAI developer docs MCP in Cursor/Codex:
 *   codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp
 * Then verify model IDs in docs before changing defaults.
 *
 * This app does not fine-tune models; accuracy comes from a capable base model
 * plus structured personal history from SQLite (in-context "training data").
 */
export function getOpenAIChatModel(): string {
  const m = process.env.OPENAI_CHAT_MODEL?.trim();
  if (m) return m;
  return "gpt-4o";
}

/** When set (e.g. `ft:gpt-4o-mini-...`), meal macro estimation uses your fine-tuned model. */
export function getOpenAIMealModel(): string {
  const m = process.env.OPENAI_MEAL_MODEL?.trim();
  if (m) return m;
  return getOpenAIChatModel();
}

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
