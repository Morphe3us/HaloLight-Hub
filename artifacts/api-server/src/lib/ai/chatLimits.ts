export const MAX_CHAT_CHARACTERS = 8000;

export function chatInputError(content: unknown): string | undefined {
  if (typeof content !== "string" || !content.trim()) return "content required";
  if (content.length > MAX_CHAT_CHARACTERS)
    return `content exceeds ${MAX_CHAT_CHARACTERS} characters`;
  return undefined;
}
