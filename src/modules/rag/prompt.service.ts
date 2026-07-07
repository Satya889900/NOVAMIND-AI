export const promptService = {
  buildRagPrompt: (query: string, context: string): string => {
    return `You are a helpful AI assistant. Use the following parsed context blocks to answer the user question.
If the context blocks do not contain enough information, explain that you don't know rather than hallucinating details.

Context blocks:
${context}

User Question: ${query}

AI Response:`;
  },
};
