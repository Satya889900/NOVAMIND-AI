export const chunkService = {
  splitTextIntoChunks: (text: string, chunkSize = 500, chunkOverlap = 50): string[] => {
    if (!text) return [];

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      const chunk = text.substring(startIndex, endIndex);
      chunks.push(chunk);
      startIndex += chunkSize - chunkOverlap;
    }

    return chunks;
  },
};
