export function countTokens(text: string): number {
  if (!text) return 0;
  // Standard rule of thumb: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}
