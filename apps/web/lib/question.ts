// Same rules as packages/engine/src/messages (C-03): at most 240 characters, never a dollar amount.
export const MAX_QUESTION_LEN = 240;

export function questionTextError(text: string): string | null {
  if (text.trim().length === 0) return "The text can't be empty.";
  if (text.length > MAX_QUESTION_LEN)
    return `Keep it to ${MAX_QUESTION_LEN} characters.`;
  if (text.includes("$")) return "Texts never include dollar amounts.";
  return null;
}
