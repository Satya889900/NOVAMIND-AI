/**
 * Cleans user prompts by removing command prefixes like "generate an image of",
 * "draw a", "create a picture of", leaving only the core subject description for diffusion models.
 */
export function cleanImagePrompt(prompt: string): string {
  if (!prompt || !prompt.trim()) return prompt;
  
  let p = prompt.trim();
  
  // Remove starting command phrases
  p = p.replace(/^(please\s+)?(generate|create|draw|paint|make|render|show)(\s+me)?(\s+a|\s+an|\s+the)?(\s+image|\s+img|\s+picture|\s+photo|\s+illustration|\s+drawing|\s+sketch|\s+portrait|\s+wallpaper)?(\s+of|\s+showing|\s+with|\s+about)?\s+/i, '');
  p = p.replace(/^(a|an|the)\s+(image|img|picture|photo|illustration|drawing|sketch|portrait|wallpaper)\s+(of|showing|with|about)\s+/i, '');
  
  return p.trim() || prompt.trim();
}
