export const contextService = {
  buildContextString: (retrievedChunks: { content: string; score?: number }[]): string => {
    if (retrievedChunks.length === 0) return '';

    return retrievedChunks
      .map((chunk, index) => `[Source Block ${index + 1}]:\n${chunk.content}`)
      .join('\n\n---\n\n');
  },
};
