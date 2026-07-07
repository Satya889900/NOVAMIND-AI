export const promptService = {
  buildSystemPrompt: (instruction = ''): string => {
    const base = 'You are NovaMind AI, an ultra-smart next-generation conversational companion built on Google Gemini.';
    return instruction ? `${base} Specifically, follow this instruction: ${instruction}` : base;
  },
};
